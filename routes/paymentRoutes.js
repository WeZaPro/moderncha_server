// routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const controller = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware"); // ✅ ใช้ของจริง

// ══════════════════════════════════════════════
//  Health Check
// ══════════════════════════════════════════════
router.get("/runksher", (req, res) => res.send("KSher PromptPay API Running"));
router.get("/payment_ksher", (req, res) => res.send("START PAYMENT"));

// ══════════════════════════════════════════════
//  KSher Webhook — ไม่มี auth
//  ⚠️ ถ้าใช้ server.js mount แบบใหม่แล้ว
//     ไม่ต้องใช้ paymentRoutes เลยก็ได้
//     เพราะ /notify ถูก register ใน server.js โดยตรงแล้ว
// ══════════════════════════════════════════════
router.post("/notify", bodyParser.text({ type: "*/*" }), controller.notify);

// ══════════════════════════════════════════════
//  Manual Trigger — ต้อง login
// ══════════════════════════════════════════════
router.post(
  "/notify-success",
  express.json(),
  authMiddleware, // ✅
  controller.notifySuccess
);

// ══════════════════════════════════════════════
//  Test Payment — ต้อง login
// ══════════════════════════════════════════════
router.get(
  "/test-payment/:deviceId",
  authMiddleware, // ✅
  controller.testPayment
);

module.exports = router;
