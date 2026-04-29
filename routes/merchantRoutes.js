const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const paymentController = require("../controllers/paymentController");
const merchantController = require("../controllers/merchantController");

router.use(auth, role("merchant", "admin","service"));

// ── payment ───────────────────────────────────
router.post("/create-qr", paymentController.createQR);
router.post("/check-order", paymentController.checkOrder);

// ── merchant ดูข้อมูลของตัวเอง ────────────────
// router.get("/devices", merchantController.getMyDevices);
router.get("/devices", merchantController.getMyOwnDevices); // ✅
router.get("/orders", merchantController.getMyOrders); // ✅ getMyOrders — กรอง merchant_id จาก JWT

module.exports = router;
