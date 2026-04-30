const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const incomeController = require("../controllers/incomeController");

// ── POST /api/income/record
// ไม่ต้อง auth — ESP32 เรียกตรง ไม่มี JWT
router.post("/record", incomeController.recordIncome);

// ── GET /api/income
// admin → ดูทั้งหมด, filter ?merchant_id=&device_id=&method=&page=&limit=
// merchant → ดูเฉพาะของตัวเอง
router.get("/", auth, role("admin", "merchant"), incomeController.getIncome);

// ── GET /api/income/carwash ─────────────────
router.get(
  "/carwash",
  auth,
  role("admin", "merchant"),
  incomeController.getIncomeCarwash
);

// ── GET /api/income/shoe ─────────────────
router.get(
  "/shoe",
  auth,
  role("admin", "merchant"),
  incomeController.getIncomeShoe
);

// ── GET /api/income/helmet ─────────────────
router.get(
  "/helmet",
  auth,
  role("admin", "merchant"),
  incomeController.getIncomeHelmet
);

// ── GET /api/income/testing ─────────────────
router.get(
  "/testmode",
  auth,
  role("admin", "merchant"),
  incomeController.getIncomeTesting
);
router.get(
  "/machine",
  auth,
  role("admin", "merchant"),
  incomeController.getMachineIncome
);

module.exports = router;
