// controllers/paymentController.js
const db = require("../models/db");
const { getSdkByMerchantId } = require("../utils/ksherSdkCache");
const { saveLog } = require("../utils/logger");
const { client, MQTT_PREFIX } = require("../config/mqtt");
const { paymentCache } = require("../config/mqttHandler");

// กัน webhook ยิงซ้ำ
const processedOrders = new Set();

let io_ref = null;
exports.setIO = (io) => {
  io_ref = io;
};

function sendMQTTCmd(deviceId, payload) {
  const topic = `${MQTT_PREFIX}/${deviceId}/cmd`;
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
  console.log("📤 MQTT CMD →", topic, JSON.stringify(payload));
}

function parseDeviceId(orderId) {
  const parts = orderId.split("_");
  if (parts.length < 3) return null;
  parts.shift();
  parts.pop();
  return parts.join("_");
}

// ══════════════════════════════════════════════
//  AUTO CANCEL — pending orders เกิน 2 นาที
// ══════════════════════════════════════════════
const PENDING_TIMEOUT_MS = 2 * 60 * 1000;

setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - PENDING_TIMEOUT_MS)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const [rows] = await db.query(
      `SELECT order_id, device_id FROM orders
       WHERE status = 'pending'
       AND created_at < ?
       AND order_id LIKE 'ORDER_%'`,
      [cutoff]
    );

    if (!rows.length) return;

    for (const row of rows) {
      await db.query("UPDATE orders SET status = 'failed' WHERE order_id = ?", [
        row.order_id,
      ]);
      console.log(`⏰ Auto-cancelled pending order: ${row.order_id}`);

      if (io_ref) {
        io_ref.emit("order-cancelled", {
          orderId: row.order_id,
          deviceId: row.device_id,
        });
      }
    }

    console.log(`🗑️ Cancelled ${rows.length} expired pending orders`);
  } catch (err) {
    console.error("❌ Auto-cancel error:", err.message);
  }
}, 30000);

// ══════════════════════════════════════════════
//  POST /api/merchant/create-qr
// ══════════════════════════════════════════════
exports.createQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const { amount, device_id, product } = req.body;

    if (!amount || !device_id) {
      return res.status(400).json({ message: "amount and device_id required" });
    }

    const [devRows] = await db.query(
      "SELECT id, name FROM devices WHERE device_id = ? AND merchant_id = ?",
      [device_id, merchantId]
    );
    if (!devRows.length) {
      return res
        .status(403)
        .json({ message: "device not assigned to this merchant" });
    }

    const { sdk, config } = await getSdkByMerchantId(merchantId);

    const deviceName = devRows[0].name || device_id;
    const productName = product
      ? `${deviceName} - ${product}`
      : `${deviceName} - Payment ${amount} THB`;

    const now = Date.now();
    const orderId = `ORDER_${device_id}_${now}`;
    const totalFee = Math.round(Number(amount) * 100);

    const requestBody = {
      mch_order_no: orderId,
      total_fee: totalFee,
      fee_type: "THB",
      device_id,
      channel: "promptpay",
      product: productName,
      notify_url: config.ksher_notify_url,
    };

    console.log(`➡️ KSher native_pay [merchant=${merchantId}]`, requestBody);
    const response = await sdk.native_pay(requestBody);
    console.log("⬅️ KSher response", JSON.stringify(response));

    const paymentCode = response.data?.PaymentCode;
    const imgdat = response.data?.imgdat;

    await db.query(
      `INSERT INTO orders (order_id, merchant_id, device_id, product, amount, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [orderId, merchantId, device_id, productName, amount]
    );

    saveLog({
      action: "create-qr",
      merchantId,
      device_id,
      orderId,
      amount,
      time: new Date().toISOString(),
    });

    res.json({ success: true, orderId, paymentCode, qr: imgdat || null });
  } catch (err) {
    console.error("❌ createQR:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ══════════════════════════════════════════════
//  POST /api/merchant/check-order
// ══════════════════════════════════════════════
exports.checkOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: "orderId required" });

    const merchantId = req.user.id;
    const { sdk } = await getSdkByMerchantId(merchantId);

    saveLog({
      action: "REQUEST order_query",
      data: { orderId },
      time: new Date(),
    });

    const response = await sdk.order_query({ mch_order_no: orderId });

    saveLog({
      action: "RESPONSE order_query",
      data: response,
      time: new Date(),
    });

    res.json(response);
  } catch (err) {
    console.error("❌ checkOrder:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ══════════════════════════════════════════════
//  POST /notify — KSher webhook (no auth)
// ══════════════════════════════════════════════
exports.notify = async (req, res) => {
  try {
    console.log("\n🔥 RAW NOTIFY BODY:", req.body);

    let json;
    try {
      json = JSON.parse(req.body);
    } catch (e) {
      console.error("❌ JSON parse error:", e.message);
      return res.send({ result: "FAIL" });
    }

    // ✅ Log ข้อมูลดิบทันทีที่รับจาก KSher
    saveLog({ action: "NOTIFY RAW", data: json, time: new Date() });

    const orderId = json.data?.mch_order_no;
    const appId = json.data?.appid || json.appid;
    const status = json.data?.result;

    if (!orderId) {
      console.log("❌ Missing orderId");
      return res.send({ result: "FAIL" });
    }

    // กัน webhook ซ้ำ
    if (processedOrders.has(orderId)) {
      console.log("⚠️ Duplicate webhook ignored:", orderId);
      return res.send({ result: "SUCCESS" });
    }

    let sdk;
    let merchantId;

    // ── Priority 1: หาจาก appId ──
    if (appId) {
      const [cfgRows] = await db.query(
        `SELECT merchant_id, ksher_notify_url FROM merchant_configs WHERE ksher_appid = ? LIMIT 1`,
        [appId]
      );
      if (cfgRows.length) {
        merchantId = cfgRows[0].merchant_id;
        console.log(`🔍 [appId] merchant_id=${merchantId}`);
        const { sdk: s } = await getSdkByMerchantId(merchantId);
        sdk = s;
      }
    }

    // ── Priority 2: fallback จาก orders ──
    if (!sdk) {
      const [orderRows] = await db.query(
        "SELECT merchant_id FROM orders WHERE order_id = ?",
        [orderId]
      );
      if (orderRows.length) {
        merchantId = orderRows[0].merchant_id;
        console.log(`🔍 [orderId] merchant_id=${merchantId}`);
        const { sdk: s } = await getSdkByMerchantId(merchantId);
        sdk = s;
      }
    }

    // ── Priority 3: fallback จาก paymentCache ──
    if (!sdk) {
      const deviceId = parseDeviceId(orderId);
      const cached = deviceId ? paymentCache.get(deviceId) : null;
      if (cached?.merchantId) {
        merchantId = cached.merchantId;
        console.log(`🔍 [cache] merchant_id=${merchantId}`);
        const { sdk: s } = await getSdkByMerchantId(merchantId);
        sdk = s;
      }
    }

    if (!sdk) {
      console.error("❌ Cannot find SDK — appId:", appId, "orderId:", orderId);
      saveLog({
        action: "NOTIFY SDK NOT FOUND",
        orderId,
        appId,
        time: new Date(),
      });
      return res.send({ result: "FAIL" });
    }

    // verify signature
    if (!sdk.verifySignature(json)) {
      console.log("❌ Invalid signature");
      // ✅ Log กรณี signature ผิด
      saveLog({
        action: "NOTIFY SIGNATURE FAIL",
        orderId,
        appId,
        merchantId,
        data: json,
        time: new Date(),
      });
      return res.send({ result: "FAIL" });
    }

    // ✅ Log หลัง verify ผ่าน พร้อมข้อมูลครบ
    saveLog({
      action: "NOTIFY VERIFIED",
      orderId,
      merchantId,
      appId,
      status,
      amount: Number(json.data?.total_fee || 0) / 100, // satang → บาท
      channel: json.data?.channel,
      transactionId: json.data?.ksher_order_no,
      time: new Date(),
    });

    console.log(
      `✅ Signature verified | STATUS: ${status} | orderId: ${orderId}`
    );

    // update orders table
    await db.query("UPDATE orders SET status = ? WHERE order_id = ?", [
      status === "SUCCESS" ? "paid" : "failed",
      orderId,
    ]);

    if (status === "SUCCESS") {
      processedOrders.add(orderId);

      const deviceId = parseDeviceId(orderId);

      const [amountRows] = await db.query(
        "SELECT amount, device_id FROM orders WHERE order_id = ?",
        [orderId]
      );
      const paidAmount = Number(amountRows[0]?.amount || 0);
      const dbDeviceId = amountRows[0]?.device_id || deviceId;

      console.log(
        `🚀 Payment SUCCESS — deviceId=${dbDeviceId} amount=${paidAmount} orderId=${orderId}`
      );

      // ✅ Log เฉพาะกรณีจ่ายสำเร็จ
      saveLog({
        action: "NOTIFY PAYMENT SUCCESS",
        orderId,
        merchantId,
        deviceId: dbDeviceId,
        amount: paidAmount,
        transactionId: json.data?.ksher_order_no,
        channel: json.data?.channel,
        time: new Date(),
      });

      if (io_ref) {
        io_ref.emit("payment-success", {
          deviceId: dbDeviceId,
          orderId,
          amount: paidAmount,
        });
      }

      if (dbDeviceId) {
        sendMQTTCmd(dbDeviceId, {
          cmd: "payment-success",
          orderId,
          amount: paidAmount,
          ksher_order_no: json.data?.ksher_order_no, // ✅ เพิ่มตรงนี้
        });
        paymentCache.delete(dbDeviceId);
      }
    }

    // ✅ Log ปิด flow
    saveLog({
      action: "NOTIFY DONE",
      status,
      orderId,
      merchantId,
      time: new Date(),
    });
    res.send({ result: "SUCCESS" });
  } catch (err) {
    console.error("❌ /notify error:", err.message, err.stack);
    saveLog({ action: "ERROR notify", error: err.message, time: new Date() });
    res.send({ result: "FAIL" });
  }
};

// ══════════════════════════════════════════════
//  POST /notify-success — manual trigger
// ══════════════════════════════════════════════
exports.notifySuccess = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId)
      return res.status(400).json({ ok: false, msg: "orderId required" });

    const deviceId = parseDeviceId(orderId);
    if (!deviceId)
      return res.status(400).json({ ok: false, msg: "invalid orderId" });

    const [amountRows] = await db.query(
      "SELECT amount FROM orders WHERE order_id = ?",
      [orderId]
    );
    const paidAmount = Number(amountRows[0]?.amount || 0);

    await db.query("UPDATE orders SET status = 'paid' WHERE order_id = ?", [
      orderId,
    ]);

    saveLog({
      action: "MANUAL NOTIFY SUCCESS",
      orderId,
      deviceId,
      amount: paidAmount,
      time: new Date(),
    });

    console.log(`🚀 MANUAL SUCCESS → ${deviceId} amount=${paidAmount}`);
    sendMQTTCmd(deviceId, {
      cmd: "payment-success",
      orderId,
      amount: paidAmount,
    });

    if (io_ref)
      io_ref.emit("payment-success", { deviceId, orderId, amount: paidAmount });

    res.json({ ok: true, deviceId, orderId, amount: paidAmount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

// ══════════════════════════════════════════════
//  GET /test-payment/:deviceId
// ══════════════════════════════════════════════
exports.testPayment = (req, res) => {
  try {
    const { deviceId } = req.params;
    const orderId = "TEST_ORDER";
    sendMQTTCmd(deviceId, {
      cmd: "payment-success",
      orderId,
      amount: 30,
      test: true,
    });
    if (io_ref)
      io_ref.emit("payment-success", { deviceId, orderId, test: true });
    console.log(`🧪 Test payment → ${deviceId}`);
    res.json({ ok: true, deviceId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
