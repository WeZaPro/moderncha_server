// config/mqttHandler.js
const { saveLog } = require("../utils/logger");
const { client, MQTT_PREFIX } = require("./mqtt");
const { getSdkByDeviceId } = require("../utils/ksherSdkCache");
const db = require("../models/db");
const { updateDeviceStatus } = require("../utils/deviceStatus");
const { pushMessage, buildIncomeMessage } = require("../utils/lineNotify"); // ✅ เพิ่ม

// กัน payment request ซ้ำต่อ device (5 วิ)
const paymentCache = new Map();

/* ─── helper ─────────────────────────────── */
function sendMQTTCmd(deviceId, payload, retain = false) {
  const topic = `${MQTT_PREFIX}/${deviceId}/cmd`;
  client.publish(topic, JSON.stringify(payload), { retain, qos: 1 });
  console.log("📤 CMD →", topic, JSON.stringify(payload));
}

// ── Auto register device ใน DB เมื่อ online ครั้งแรก ──
async function autoRegisterDevice(deviceId) {
  try {
    const [rows] = await db.query(
      "SELECT id FROM devices WHERE device_id = ?",
      [deviceId]
    );
    if (rows.length) return;
    await db.query(
      `INSERT INTO devices (device_id, name, merchant_id, branch_id)
       VALUES (?, ?, NULL, NULL)`,
      [deviceId, deviceId]
    );
    console.log(`🆕 Device auto-registered in DB: ${deviceId}`);
  } catch (e) {
    console.error(`❌ autoRegisterDevice: ${e.message}`);
  }
}

// ── สร้าง QR payment ──
async function createPaymentQR(deviceId, amount) {
  const { sdk, config, merchantId } = await getSdkByDeviceId(deviceId);
  const orderId = `ORDER_${deviceId}_${Date.now()}`;
  const totalFee = Math.round(amount * 100);

  const requestBody = {
    mch_order_no: orderId,
    total_fee: totalFee,
    fee_type: "THB",
    device_id: deviceId,
    channel: "promptpay",
    product: `ESP32 Payment ${deviceId}`,
    notify_url: config.ksher_notify_url,
  };

  console.log(`➡️ KSher native_pay [merchant=${merchantId}]`, requestBody);
  const response = await sdk.native_pay(requestBody);
  console.log("⬅️ KSher response", JSON.stringify(response));
  const paymentCode = response.data.PaymentCode;

  await db.query(
    `INSERT INTO orders (order_id, merchant_id, device_id, product, amount, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [orderId, merchantId, deviceId, `ESP32 Payment ${deviceId}`, amount]
  );
  console.log(`📝 Order saved: ${orderId} merchant=${merchantId}`);
  return { orderId, paymentCode, merchantId };
}

// ══════════════════════════════════════════════
//  handleSaveIncome — บันทึก income ลง DB + ส่ง LINE
// ══════════════════════════════════════════════
async function handleSaveIncome(deviceId, data, io) {
  const machineSystem =
    data.machineSystem || data.machine_system || "CATCARWASH";
  console.log(`💾 save-income [${deviceId}] machineSystem=${machineSystem}`);

  try {
    // ── ดึง merchant_id + branch_id + line_user_id พร้อมกัน
    const [rows] = await db.query(
      `SELECT dc.merchant_id, dc.branch_id, dc.name AS device_name,
              u.line_user_id
       FROM device_configs dc
       LEFT JOIN users u ON u.id = dc.merchant_id
       WHERE dc.device_id = ?`,
      [deviceId]
    );

    const merchantId = rows[0]?.merchant_id || data.merchant_id || null;
    const branchId = rows[0]?.branch_id || data.branch_id || null;
    const deviceName = rows[0]?.device_name || deviceId;
    const lineUserId = rows[0]?.line_user_id || null;

    console.log(
      `🔍 device: merchant=${merchantId} branch=${branchId} line=${lineUserId}`
    );

    const dateTime = data.dateTime
      ? new Date(data.dateTime).toISOString().slice(0, 19).replace("T", " ")
      : new Date().toISOString().slice(0, 19).replace("T", " ");

    // ── ตรวจ method จากยอดที่มีค่า
    const method =
      (data.qrIncome ?? 0) > 0
        ? "qr"
        : (data.cashIncome ?? 0) > 0
        ? "cash"
        : (data.coinIncome ?? 0) > 0
        ? "coin"
        : "cash";

    // ── Testing / debug mode ──
    if (machineSystem === "TESTING" || data.debugMode) {
      await db.query(
        `INSERT INTO income_testing
          (device_id, merchant_id, branch_id,
           cash_income, coin_income, sum_income, last_money,
           date_time, debug_mode)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          deviceId,
          merchantId,
          branchId,
          data.cashIncome ?? 0,
          data.coinIncome ?? 0,
          data.sumIncome ?? 0,
          data.lastMoney ?? 0,
          dateTime,
          data.debugMode ? 1 : 0,
        ]
      );
      console.log(`✅ Testing income saved: ${deviceId}`);

      // ── CATCARWASH ──
    } else if (machineSystem === "CATCARWASH") {
      await db.query(
        `INSERT INTO income_catcarwash
          (device_id, merchant_id, branch_id, machine_system, order_id,
           cash_income, coin_income, qr_income, sum_income,
           wax, tire, vac, air, foam, water, spray, frag,
           last_money, date_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE sum_income = VALUES(sum_income)`,
        [
          deviceId,
          merchantId,
          branchId,
          machineSystem,
          data.orderId || `${deviceId}_${Date.now()}`,
          data.cashIncome ?? 0,
          data.coinIncome ?? 0,
          data.qrIncome ?? 0,
          data.sumIncome ?? 0,
          data.Wax ?? 0,
          data.Tire ?? 0,
          data.Vac ?? 0,
          data.Air ?? 0,
          data.Foam ?? 0,
          data.Water ?? 0,
          data.Spray ?? 0,
          data.Frag ?? 0,
          data.lastMoney ?? 0,
          dateTime,
        ]
      );
      console.log(`✅ CATCARWASH income saved: ${deviceId}`);

      // ── CATPAW-SHOE ──
    } else if (machineSystem === "CATPAW-SHOE") {
      await db.query(
        `INSERT INTO income_catpaw_shoe
          (device_id, merchant_id, branch_id, machine_system, order_id,
           cash_income, coin_income, qr_income, sum_income, last_money, date_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE sum_income = VALUES(sum_income)`,
        [
          deviceId,
          merchantId,
          branchId,
          machineSystem,
          data.orderId || `${deviceId}_${Date.now()}`,
          data.cashIncome ?? 0,
          data.coinIncome ?? 0,
          data.qrIncome ?? 0,
          data.sumIncome ?? 0,
          data.lastMoney ?? 0,
          dateTime,
        ]
      );
      console.log(`✅ CATPAW-SHOE income saved: ${deviceId}`);

      // ── CATPAW-HELMET ──
    } else if (machineSystem === "CATPAW-HELMET") {
      await db.query(
        `INSERT INTO income_catpaw_helmet
          (device_id, merchant_id, branch_id, machine_system, order_id,
           cash_income, coin_income, qr_income, sum_income, last_money, date_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE sum_income = VALUES(sum_income)`,
        [
          deviceId,
          merchantId,
          branchId,
          machineSystem,
          data.orderId || `${deviceId}_${Date.now()}`,
          data.cashIncome ?? 0,
          data.coinIncome ?? 0,
          data.qrIncome ?? 0,
          data.sumIncome ?? 0,
          data.lastMoney ?? 0,
          dateTime,
        ]
      );
      console.log(`✅ CATPAW-HELMET income saved: ${deviceId}`);
    } else {
      console.warn(`⚠️ Unknown machineSystem: ${machineSystem} [${deviceId}]`);
      sendMQTTCmd(deviceId, {
        cmd: "save-income-ack",
        ok: false,
        error: `Unknown machineSystem: ${machineSystem}`,
      });
      return;
    }

    // ── ACK กลับ ESP32
    sendMQTTCmd(deviceId, {
      cmd: "save-income-ack",
      ok: true,
      machineSystem,
      dateTime,
    });

    // ── emit realtime ให้ frontend
    io.emit("device-income-saved", { deviceId, machineSystem, dateTime });

    // ── ส่ง LINE notify (non-blocking — ไม่กระทบ flow หลัก)
    if (lineUserId && machineSystem !== "TESTING" && !data.debugMode) {
      pushMessage(lineUserId, [
        buildIncomeMessage({
          deviceName,
          method,
          price: data.sumIncome ?? 0,
          branchId,
          createdAt: dateTime,
        }),
      ]);
      console.log(`📨 LINE notify → ${lineUserId} (${deviceName})`);
    } else if (!lineUserId) {
      console.log(
        `⚠️ LINE notify skipped: no line_user_id for merchant=${merchantId}`
      );
    }

    saveLog({
      deviceId,
      action: "save-income",
      data: { machineSystem, sumIncome: data.sumIncome },
      time: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`❌ handleSaveIncome [${deviceId}]:`, e.message);
    sendMQTTCmd(deviceId, {
      cmd: "save-income-ack",
      ok: false,
      error: e.message,
    });
  }
}

/* ─── main ───────────────────────────────── */
function initMQTT(client, io, deviceRuntime, saveDevice, MQTT_PREFIX) {
  client.on("connect", () => {
    console.log("✅ MQTT Handler ready");
    client.subscribe(`${MQTT_PREFIX}/+/status`, { qos: 1 });
    client.subscribe(`${MQTT_PREFIX}/+/data`, { qos: 1 });
    client.subscribe(`${MQTT_PREFIX}/+/cmd_ack`, { qos: 1 });
    client.subscribe(`${MQTT_PREFIX}/+/payment/request`, { qos: 1 });
    client.subscribe(`${MQTT_PREFIX}/+/sensor`, { qos: 1 });
    client.subscribe(`${MQTT_PREFIX}/+/income`, { qos: 1 });
    client.subscribe(`${MQTT_PREFIX}/+/state`, { qos: 1 });
    console.log(
      `📡 Subscribed: ${MQTT_PREFIX}/+/{status|data|cmd_ack|payment/request|sensor|income|state}`
    );
  });

  client.on("message", async (topic, message, packet) => {
    if (packet.retain) {
      console.log("⏭️  Skip retained:", topic);
      return;
    }

    const payload = message.toString();
    const parts = topic.split("/");
    if (parts.length < 4) {
      console.log("⚠️ INVALID TOPIC:", topic);
      return;
    }

    const deviceId = parts[2];
    const type = parts[3];

    let data = {};
    try {
      data = JSON.parse(payload);
    } catch {
      console.log("⚠️ JSON parse fail -> skip");
      return;
    }

    // update lastSeen ทุก message
    let rt = deviceRuntime.get(deviceId) || { online: false, lastSeen: null };
    rt.lastSeen = Date.now();
    deviceRuntime.set(deviceId, rt);

    /* ── CMD ACK ─────────────────────────── */
    if (type === "cmd_ack") {
      console.log("✅ CMD ACK:", deviceId, data);
      io.emit("device-cmd-ack", { deviceId, data });
      if (data.cmd === "set-config") {
        io.emit("device-config-ack", { deviceId, data });
      }
      saveLog({
        deviceId,
        action: "cmd_ack",
        data,
        time: new Date().toISOString(),
      });
      return;
    }

    /* ── STATUS ──────────────────────────── */
    if (type === "status") {
      const status = data.status;
      console.log(`📊 STATUS [${deviceId}]: ${status}`);

      rt = deviceRuntime.get(deviceId) || {
        online: false,
        lastSeen: Date.now(),
      };

      if (status === "online") {
        const isNew = saveDevice(deviceId);
        await autoRegisterDevice(deviceId);
        if (!rt.online) {
          rt.online = true;
          rt.lastSeen = Date.now();
          deviceRuntime.set(deviceId, rt);
          await updateDeviceStatus(deviceId, true);
          io.emit("device-online", { deviceId, isNew });
          console.log(`🟢 Online: ${deviceId}`);
        } else {
          rt.lastSeen = Date.now();
          deviceRuntime.set(deviceId, rt);
        }
      } else if (status === "offline") {
        rt.online = false;
        rt.lastSeen = Date.now();
        deviceRuntime.set(deviceId, rt);
        await updateDeviceStatus(deviceId, false);
        io.emit("device-offline", { deviceId });
        console.log(`🔴 Offline: ${deviceId}`);
      } else {
        if (!rt.online) {
          rt.online = true;
          rt.lastSeen = Date.now();
          deviceRuntime.set(deviceId, rt);
          await autoRegisterDevice(deviceId);
          await updateDeviceStatus(deviceId, true);
          io.emit("device-online", { deviceId, isNew: false });
        } else {
          rt.lastSeen = Date.now();
          deviceRuntime.set(deviceId, rt);
        }
      }
      io.emit("device-status", { deviceId, status, time: Date.now() });
      return;
    }

    /* ── DATA ────────────────────────────── */
    if (type === "data") {
      console.log(" mqttHandler.js get data from esp32 --->✅ ✅ ✅ ✅ ✅");
      rt = deviceRuntime.get(deviceId) || {
        online: false,
        lastSeen: Date.now(),
      };
      const wasOffline = !rt.online;
      if (wasOffline) {
        console.log(`🟢 Back online via data: ${deviceId}`);
        await autoRegisterDevice(deviceId);
        await updateDeviceStatus(deviceId, true);
        rt.online = true;
        rt.lastSeen = Date.now();
        deviceRuntime.set(deviceId, rt);
        io.emit("device-online", { deviceId, isNew: false });
      }

      // ✅ Update device_configs ด้วย telemetry fields
      try {
        const updates = {};
        const params = [];
        const setClauses = [];

        if (data.current_state !== undefined) {
          setClauses.push("current_state = ?");
          params.push(data.current_state);
        }
        if (data.water_level !== undefined && Array.isArray(data.water_level)) {
          setClauses.push("water_level = ?");
          params.push(data.water_level.map((v) => (v ? "1" : "0")).join(","));
        }
        if (data.lastMoney !== undefined) {
          setClauses.push("last_money = ?");
          params.push(data.lastMoney);
        }
        if (data.debugMode !== undefined) {
          setClauses.push("debug = ?");
          params.push(data.debugMode ? 1 : 0);
        }

        if (setClauses.length > 0) {
          setClauses.push("lastedUpdate = NOW()");
          params.push(deviceId);
          await db.query(
            `UPDATE device_configs SET ${setClauses.join(
              ", "
            )} WHERE device_id = ?`,
            params
          );
          console.log(`✅ device_configs updated from telemetry [${deviceId}]`);
        }
      } catch (e) {
        console.error(`❌ telemetry DB update [${deviceId}]:`, e.message);
      }

      io.emit("device-data", { deviceId, data, time: Date.now() });
      return;
    }

    /* ── STATE ───────────────────────────── */
    if (type === "state") {
      console.log(`🔄 STATE [${deviceId}]: ${data.current_state}`);
      io.emit("device-state", {
        deviceId,
        current_state: data.current_state,
        time: Date.now(),
      });
      if (data.current_state) {
        try {
          await db.query(
            `UPDATE device_configs SET current_state = ?, lastedUpdate = NOW() WHERE device_id = ?`,
            [data.current_state, deviceId]
          );
        } catch (e) {
          console.error(`❌ state DB update [${deviceId}]:`, e.message);
        }
      }
      return;
    }

    /* ── SENSOR ──────────────────────────── */
    if (type === "sensor") {
      const cmd = data.cmd || "sensor-update";
      console.log(`📡 SENSOR [${deviceId}] cmd=${cmd}`);

      if (cmd === "update-water-level" || data.water_level !== undefined) {
        try {
          const wlStr = Array.isArray(data.water_level)
            ? data.water_level.map((v) => (v ? "1" : "0")).join(",")
            : "0,0,0,0,0,0";
          const snStr = Array.isArray(data.sensor)
            ? data.sensor.map((v) => (v ? "1" : "0")).join(",")
            : null;

          let sql =
            "UPDATE device_configs SET water_level = ?, lastedUpdate = NOW()";
          const vals = [wlStr];
          if (snStr) {
            sql += ", sensor = ?";
            vals.push(snStr);
          }
          sql += " WHERE device_id = ?";
          vals.push(deviceId);

          const [result] = await db.query(sql, vals);

          if (result.affectedRows > 0) {
            console.log(`✅ water_level updated [${deviceId}]`);
            io.emit("device-water-level", {
              deviceId,
              water_level: data.water_level,
              sensor: data.sensor,
              time: Date.now(),
            });
            sendMQTTCmd(deviceId, {
              cmd: "water-level-ack",
              ok: true,
              water_level: data.water_level,
            });
            saveLog({
              deviceId,
              action: "update-water-level",
              data: { water_level: data.water_level, sensor: data.sensor },
              time: new Date().toISOString(),
            });
          } else {
            console.warn(`⚠️ water_level: device not found [${deviceId}]`);
            sendMQTTCmd(deviceId, {
              cmd: "water-level-ack",
              ok: false,
              error: "device not found",
            });
          }
        } catch (e) {
          console.error(`❌ sensor handler [${deviceId}]:`, e.message);
        }
      }
      io.emit("device-sensor", { deviceId, data, time: Date.now() });
      return;
    }

    /* ── INCOME ──────────────────────────── */
    if (type === "income") {
      await handleSaveIncome(deviceId, data, io);
      return;
    }

    /* ── PAYMENT REQUEST ─────────────────── */
    if (type === "payment") {
      const subType = parts[4];
      if (subType !== "request") return;

      const amount = Number(data.amount);
      if (!amount || amount < 1 || amount > 100000) {
        console.log(`⚠️ Payment invalid amount: ${data.amount}`);
        sendMQTTCmd(deviceId, {
          cmd: "payment-error",
          error: "invalid amount",
        });
        return;
      }

      console.log(`💳 Payment request [${deviceId}] amount=${amount} THB`);
      io.emit("payment-request", { deviceId, amount });

      const cached = paymentCache.get(deviceId);
      if (cached && Date.now() - cached.time < 5000) {
        console.log(`⚠️ Duplicate payment blocked [${deviceId}]`);
        sendMQTTCmd(deviceId, {
          cmd: "show-qr",
          orderId: cached.orderId,
          paymentCode: cached.paymentCode,
          amount,
        });
        return;
      }

      try {
        const { orderId, paymentCode, merchantId } = await createPaymentQR(
          deviceId,
          amount
        );
        paymentCache.set(deviceId, {
          orderId,
          paymentCode,
          merchantId,
          time: Date.now(),
        });
        sendMQTTCmd(deviceId, { cmd: "show-qr", orderId, paymentCode, amount });
        io.emit("payment-qr-created", {
          deviceId,
          orderId,
          amount,
          merchantId,
        });
        console.log(
          `✅ QR sent to [${deviceId}] orderId=${orderId} merchant=${merchantId}`
        );
        saveLog({
          action: "payment-qr-created",
          deviceId,
          orderId,
          amount,
          merchantId,
          time: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`❌ KSher error [${deviceId}]:`, err.message);
        sendMQTTCmd(deviceId, { cmd: "payment-error", error: err.message });
        io.emit("payment-error", { deviceId, error: err.message });
      }
      return;
    }

    console.log("⚠️ UNKNOWN MQTT TYPE:", type, "topic:", topic);
  });
}

module.exports = initMQTT;
module.exports.paymentCache = paymentCache;
module.exports.sendMQTTCmd = sendMQTTCmd;
module.exports.handleSaveIncome = handleSaveIncome;
