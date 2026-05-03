// controllers/paymentController.js
const db = require("../models/db");
const { getSdkByMerchantId } = require("../utils/ksherSdkCache");
const { saveLog } = require("../utils/logger");
const { client, MQTT_PREFIX } = require("../config/mqtt");
const { paymentCache } = require("../config/mqttHandler");

// ══════════════════════════════════════════════
//  ป้องกัน webhook ยิงซ้ำ — ใช้ Map + TTL แทน Set
// ══════════════════════════════════════════════
const PROCESSED_TTL_MS = 10 * 60 * 1000; // 10 นาที
const processedOrders = new Map(); // orderId → timestamp

function isProcessed(orderId) {
  const t = processedOrders.get(orderId);
  if (!t) return false;
  if (Date.now() - t > PROCESSED_TTL_MS) {
    processedOrders.delete(orderId);
    return false;
  }
  return true;
}

function markProcessed(orderId) {
  processedOrders.set(orderId, Date.now());
}

// ══════════════════════════════════════════════
//  Socket.IO reference
// ══════════════════════════════════════════════
let io_ref = null;
exports.setIO = (io) => {
  io_ref = io;
};

// ══════════════════════════════════════════════
//  Helper: ส่ง MQTT command ไปที่ device
// ══════════════════════════════════════════════
function sendMQTTCmd(deviceId, payload) {
  const topic = `${MQTT_PREFIX}/${deviceId}/cmd`;
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
  console.log("📤 MQTT CMD →", topic, JSON.stringify(payload));
}

// ══════════════════════════════════════════════
//  Helper: แยก deviceId จาก orderId
//  format: ORDER_{deviceId}_{timestamp}
// ══════════════════════════════════════════════
function parseDeviceId(orderId) {
  const parts = orderId.split("_");
  if (parts.length < 3) return null;
  parts.shift(); // ตัด "ORDER"
  parts.pop(); // ตัด timestamp
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
      await db.query(
        "UPDATE orders SET status = 'cancelled' WHERE order_id = ? AND status = 'pending'",
        [row.order_id]
      );
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
}, 30_000);

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

    // ── Parse JSON body ──
    let json;
    try {
      json = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (e) {
      console.error("❌ JSON parse error:", e.message);
      return res.send({ result: "FAIL" });
    }

    saveLog({ action: "NOTIFY RAW", data: json, time: new Date() });

    const orderId = json.data?.mch_order_no;
    const appId = json.data?.appid || json.appid;
    const status = json.data?.result;

    if (!orderId) {
      console.log("❌ Missing orderId");
      return res.send({ result: "FAIL" });
    }

    // ── กัน webhook ซ้ำ ──
    if (isProcessed(orderId)) {
      console.log("⚠️ Duplicate webhook ignored:", orderId);
      return res.send({ result: "SUCCESS" });
    }

    // ── หา SDK ──
    let sdk;
    let merchantId;

    // Priority 1: หาจาก appId
    if (appId) {
      const [cfgRows] = await db.query(
        `SELECT merchant_id FROM merchant_configs WHERE ksher_appid = ? LIMIT 1`,
        [appId]
      );
      if (cfgRows.length) {
        merchantId = cfgRows[0].merchant_id;
        console.log(`🔍 [appId] merchant_id=${merchantId}`);
        const { sdk: s } = await getSdkByMerchantId(merchantId);
        sdk = s;
      }
    }

    // Priority 2: fallback จาก orders table
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

    // Priority 3: fallback จาก paymentCache
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

    // ── Verify signature ──
    if (!sdk.verifySignature(json)) {
      console.log("❌ Invalid signature");
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

    saveLog({
      action: "NOTIFY VERIFIED",
      orderId,
      merchantId,
      appId,
      status,
      amount: Number(json.data?.total_fee || 0) / 100,
      channel: json.data?.channel,
      transactionId: json.data?.ksher_order_no,
      time: new Date(),
    });

    console.log(
      `✅ Signature verified | STATUS: ${status} | orderId: ${orderId}`
    );

    // ── FIX: อัปเดต DB เฉพาะกรณี SUCCESS เท่านั้น ──
    if (status === "SUCCESS") {
      // ป้องกัน race condition — ตรวจสอบก่อน update
      const [currentRows] = await db.query(
        "SELECT status FROM orders WHERE order_id = ?",
        [orderId]
      );

      if (!currentRows.length) {
        console.error("❌ Order not found in DB:", orderId);
        return res.send({ result: "FAIL" });
      }

      if (currentRows[0].status === "paid") {
        console.log("⚠️ Order already paid, skipping:", orderId);
        markProcessed(orderId);
        return res.send({ result: "SUCCESS" });
      }

      await db.query(
        "UPDATE orders SET status = 'paid' WHERE order_id = ? AND status = 'pending'",
        [orderId]
      );

      markProcessed(orderId);

      const deviceId = parseDeviceId(orderId);

      const [amountRows] = await db.query(
        "SELECT amount, device_id FROM orders WHERE order_id = ?",
        [orderId]
      );

      if (!amountRows.length) {
        console.error("❌ Cannot fetch order amount:", orderId);
        return res.send({ result: "FAIL" });
      }

      const paidAmount = Number(amountRows[0].amount || 0);
      const dbDeviceId = amountRows[0].device_id || deviceId;

      console.log(
        `🚀 Payment SUCCESS — deviceId=${dbDeviceId} amount=${paidAmount} orderId=${orderId}`
      );

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
          ksher_order_no: json.data?.ksher_order_no,
        });
        paymentCache.delete(dbDeviceId);
      }

      // ══════════════════════════════════════════
      //  ✅ Save income — ข้อมูลครบจาก webhook
      //  ใช้ device_configs join เพื่อได้ branch_id
      // ══════════════════════════════════════════
      try {
        const [dcRows] = await db.query(
          `SELECT dc.name AS device_name, dc.branch_id
           FROM device_configs dc
           WHERE dc.device_id = ?`,
          [dbDeviceId]
        );

        const deviceName = dcRows[0]?.device_name || dbDeviceId;
        const branchId = dcRows[0]?.branch_id || null;

        await db.query(
          `INSERT INTO income
            (device_id, device_name, merchant_id, branch_id,
             method, ksher_order_no, order_id, price, mode)
           VALUES (?, ?, ?, ?, 'qr', ?, ?, ?, 'prod')`,
          [
            dbDeviceId,
            deviceName,
            merchantId,
            branchId,
            json.data?.ksher_order_no || null, // ✅ ได้จาก webhook โดยตรง
            orderId,
            paidAmount,
          ]
        );

        console.log(
          `✅ Income saved — device=${dbDeviceId} amount=${paidAmount} ksher=${json.data?.ksher_order_no}`
        );

        saveLog({
          action: "INCOME SAVED",
          orderId,
          merchantId,
          deviceId: dbDeviceId,
          ksher_order_no: json.data?.ksher_order_no,
          amount: paidAmount,
          time: new Date(),
        });
      } catch (incomeErr) {
        // ไม่ return FAIL — payment สำเร็จแล้ว แค่ log error
        console.error("❌ Save income error:", incomeErr.message);
        saveLog({
          action: "INCOME SAVE ERROR",
          orderId,
          error: incomeErr.message,
          time: new Date(),
        });
      }
    } else {
      // Non-SUCCESS: log เฉยๆ ไม่แตะ DB (user อาจจ่ายใหม่ได้)
      console.log(`ℹ️ Non-success notify: status=${status} orderId=${orderId}`);
      saveLog({
        action: "NOTIFY NON-SUCCESS",
        status,
        orderId,
        merchantId,
        time: new Date(),
      });
    }

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
//  POST /notify-success — manual trigger (ต้องการ auth)
// ══════════════════════════════════════════════
exports.notifySuccess = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId)
      return res.status(400).json({ ok: false, msg: "orderId required" });

    const deviceId = parseDeviceId(orderId);
    if (!deviceId)
      return res.status(400).json({ ok: false, msg: "invalid orderId format" });

    const [orderRows] = await db.query(
      "SELECT amount, status FROM orders WHERE order_id = ?",
      [orderId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ ok: false, msg: "order not found" });
    }

    if (orderRows[0].status === "paid") {
      return res.status(409).json({ ok: false, msg: "order already paid" });
    }

    const paidAmount = Number(orderRows[0].amount || 0);

    await db.query(
      "UPDATE orders SET status = 'paid' WHERE order_id = ? AND status = 'pending'",
      [orderId]
    );

    markProcessed(orderId);

    saveLog({
      action: "MANUAL NOTIFY SUCCESS",
      orderId,
      deviceId,
      amount: paidAmount,
      triggeredBy: req.user?.id || "unknown",
      time: new Date(),
    });

    console.log(`🚀 MANUAL SUCCESS → ${deviceId} amount=${paidAmount}`);
    sendMQTTCmd(deviceId, {
      cmd: "payment-success",
      orderId,
      amount: paidAmount,
    });

    if (io_ref) {
      io_ref.emit("payment-success", { deviceId, orderId, amount: paidAmount });
    }

    res.json({ ok: true, deviceId, orderId, amount: paidAmount });
  } catch (err) {
    console.error("❌ notifySuccess:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
};

// ══════════════════════════════════════════════
//  GET /test-payment/:deviceId
// ══════════════════════════════════════════════
exports.testPayment = (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId)
      return res.status(400).json({ ok: false, msg: "deviceId required" });

    const orderId = `TEST_${deviceId}_${Date.now()}`;
    sendMQTTCmd(deviceId, {
      cmd: "payment-success",
      orderId,
      amount: 30,
      test: true,
    });

    if (io_ref) {
      io_ref.emit("payment-success", { deviceId, orderId, test: true });
    }

    console.log(`🧪 Test payment → ${deviceId}`);
    res.json({ ok: true, deviceId, orderId });
  } catch (err) {
    console.error("❌ testPayment:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
};
