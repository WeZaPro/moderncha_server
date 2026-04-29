// routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const controller = require("../controllers/paymentController");

// health check
router.get("/runksher", (req, res) => res.send("KSher PromptPay API Running"));
router.get("/payment_ksher", (req, res) => res.send("START PAYMENT"));

// webhook — ต้อง raw text ก่อน parse
router.post("/notify", bodyParser.text({ type: "*/*" }), controller.notify);

// manual trigger (เทสโดยไม่ต้องจ่ายจริง)
router.post("/notify-success", express.json(), controller.notifySuccess);

// ทดสอบ trigger payment-success ผ่าน GET
router.get("/test-payment/:deviceId", controller.testPayment);

module.exports = router;
