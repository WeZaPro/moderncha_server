const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const projectController = require("../controllers/projectController");

// ── Static routes (ต้องอยู่ก่อน /:id ทั้งหมด) ──────────────────

router.post("/create", auth, role("admin"), projectController.createProject);

router.get(
  "/",
  auth,
  role("admin", "merchant", "service"),
  projectController.getMyProjects
);

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

// ✅ ย้ายขึ้นมาก่อน /:id — มิฉะนั้น Express จะ match "default-config" เป็น :id
router.get(
  "/default-config",
  auth,
  role("admin", "merchant", "service"),
  projectController.getDefaultConfig
);

// ── Dynamic routes /:id (ต้องอยู่ท้ายสุด) ───────────────────────

router.get(
  "/:id",
  auth,
  role("admin", "merchant"),
  projectController.getProjectById
);

router.put("/:id", auth, role("admin"), projectController.updateProject);

router.delete("/:id", auth, role("admin"), projectController.deleteProject);

module.exports = router;
