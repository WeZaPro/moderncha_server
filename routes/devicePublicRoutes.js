// routes/devicePublicRoutes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/deviceController");
const income_controller = require("../controllers/incomeController");

// ── ESP32 device calls — ไม่ต้อง auth ──

// Config
router.post("/device-configs/sync", controller.syncConfigFromDevice);
router.post("/device-configs/runtime", controller.updateRuntimeFromDevice);
router.patch("/device-configs/:device_id/state", controller.updateDeviceState);

// Income
router.post("/income/machine", income_controller.recordMachineIncome);
router.post("/income/testing", income_controller.recordTestingIncome);
router.get("/income/machine", income_controller.getMachineIncome);

module.exports = router;
