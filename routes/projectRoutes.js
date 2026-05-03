const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const projectController = require("../controllers/projectController"); // ✅ ชื่อตรง

router.post(
  "/create",
  auth,
  // role("admin", "merchant"),
  role("admin"),
  projectController.createProject
);
router.get(
  "/",
  auth,
  role("admin", "merchant", "service"),
  projectController.getMyProjects
);

// ✅ เพิ่มก่อน module.exports
router.get(
  "/device-config/:device_id",
  auth,
  role("admin", "merchant", "service"),
  projectController.getDeviceConfig
);
router.put(
  "/device-config/:device_id",
  auth,
  role("admin", "merchant", "service"),
  projectController.updateDeviceConfig
);

// ✅ GET /api/merchant/project/:id  — ดู project เดียว
// หมายเหตุ: ต้องวางก่อน route "/:id" อื่นๆ และหลัง "/" เสมอ
router.get(
  "/:id",
  auth,
  role("admin", "merchant"),
  projectController.getProjectById
);

router.put(
  "/:id",
  auth,
  // role("admin", "merchant"),
  role("admin"),
  projectController.updateProject
);
router.delete(
  "/:id",
  auth,
  // role("admin", "merchant"),
  role("admin"),
  projectController.deleteProject
);

router.get(
  "/default-config",
  auth,
  role("admin", "merchant", "service"),
  projectController.getDefaultConfig
);
//==========================================

module.exports = router;
