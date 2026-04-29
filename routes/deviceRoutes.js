// routes/deviceRoutes.js
const express = require("express");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ── multer config สำหรับ video ──
const VIDEO_DIR = path.join(__dirname, "../uploads/videos");
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEO_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `video_${ts}${ext}`);
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    // const allowed = [".mp4", ".avi", ".mov", ".mkv", ".webm"];
    const allowed = [".mp4"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`ไม่รองรับ format: ${ext}`));
  },
});

module.exports = (io) => {
  const router = express.Router();
  const controller = require("../controllers/deviceController");
  const videoCtrl = require("../controllers/videoController");

  // ── MQTT commands ──────────────────────────────────────────
  router.post("/send-device", auth, role("admin"), controller.sendDevice);
  router.post("/broadcast", auth, role("admin"), controller.broadcast(io));

  // ── Static routes ต้องวางก่อน :device_id ──────────────────

  // map data (admin + merchant)
  router.get(
    "/device-configs/map-data",
    auth,
    role("admin", "merchant", "service"),
    controller.getMapData
  );

  // ESP32 sync config (ไม่ต้อง auth)
  router.post("/device-configs/sync", controller.syncConfigFromDevice);

  // Send config via MQTT
  router.post(
    "/send-config-from-db",
    auth,
    role("admin", "merchant", "service"),
    controller.sendConfigFromDB
  );
  router.post(
    "/send-config-to-group",
    auth,
    role("admin"),
    controller.sendConfigToGroup
  );

  // ── Video routes ───────────────────────────────────────────
  // ── Video routes ──────────────────────────────
  router.post(
    "/video/upload",
    auth,
    role("admin"),
    uploadVideo.single("video_file"),
    videoCtrl.uploadVideo
  );
  router.get(
    "/video/list",
    auth,
    role("admin", "merchant"),
    videoCtrl.listVideos
  );
  // ✅ send-to-device ต้องอยู่ก่อน /:id
  router.post(
    "/video/send-to-device",
    auth,
    role("admin"),
    videoCtrl.sendVideoToDevice
  );
  // ✅ /:id อยู่หลังสุด
  router.delete("/video/:id", auth, role("admin"), videoCtrl.deleteVideo);

  // ── CRUD device_configs (:device_id ต้องอยู่หลัง static routes) ──
  router.get(
    "/device-configs",
    auth,
    role("admin", "merchant", "service"),
    controller.getAllDeviceConfigs
  );
  router.get(
    "/device-configs/:device_id",
    auth,
    role("admin", "merchant", "service"),
    controller.getDeviceConfig
  );
  router.post(
    "/device-configs",
    auth,
    role("admin"),
    controller.createDeviceConfig
  );
  router.put(
    "/device-configs/:device_id",
    auth,
    role("admin", "merchant", "service"),
    controller.updateDeviceConfig
  );
  router.delete(
    "/device-configs/:device_id",
    auth,
    role("admin"),
    controller.deleteDeviceConfig
  );

  // ESP32 อัปเดต runtime state
  router.patch(
    "/device-configs/:device_id/state",
    controller.updateDeviceState
  );

  // ── Income routes (แยก 3 API) ─────────────────

  return router;
};
