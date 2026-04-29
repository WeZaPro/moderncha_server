// controllers/videoController.js
const path = require("path");
const fs = require("fs");
const { client, MQTT_PREFIX } = require("../config/mqtt");
const db = require("../models/db");

const VIDEO_DIR = path.join(__dirname, "../uploads/videos");
const LOG_FILE = path.join(__dirname, "../uploads/videos/video_log.json");
const PUBLIC_URL = "https://catvending-th.com";
const MAX_VIDEOS = 3; // ✅ จำกัดสูงสุด 3 วิดีโอ
const MAX_FILE_SIZE = 3 * 1024 * 1024; // ✅ จำกัดขนาดไฟล์สูงสุด 3MB

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

function readLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ══════════════════════════════════════════════
//  POST /video/upload
// ══════════════════════════════════════════════
exports.uploadVideo = (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // ✅ ชั้นที่ 1: เช็คขนาดไฟล์
    if (req.file.size > MAX_FILE_SIZE) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        message: `ไฟล์ใหญ่เกินไป (${(req.file.size / 1024 / 1024).toFixed(
          1
        )}MB) — สูงสุด 3MB`,
        size: req.file.size,
        max: MAX_FILE_SIZE,
      });
    }

    // ✅ ชั้นที่ 2: เช็คจำนวน video
    const log = readLog();
    if (log.length >= MAX_VIDEOS) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        message: `มี Video ครบ ${MAX_VIDEOS} ไฟล์แล้ว กรุณาลบ Video เก่าก่อนอัปโหลดใหม่`,
        count: log.length,
        max: MAX_VIDEOS,
      });
    }

    const { originalname, filename, size, mimetype } = req.file;
    const uploadedBy = req.user?.email || "admin";
    const now = new Date().toISOString();

    const entry = {
      id: Date.now(),
      filename,
      originalname,
      size,
      mimetype,
      url: `${PUBLIC_URL}/uploads/videos/${filename}`,
      uploaded_by: uploadedBy,
      uploaded_at: now,
      description: req.body.description || "",
    };

    log.unshift(entry);
    writeLog(log);

    console.log(
      `📹 Video uploaded: ${filename} by ${uploadedBy} (${
        log.length
      }/${MAX_VIDEOS}) size: ${(size / 1024 / 1024).toFixed(1)}MB`
    );
    res.json({ ok: true, ...entry, count: log.length, max: MAX_VIDEOS });
  } catch (e) {
    console.error("❌ uploadVideo:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  GET /video/list
// ══════════════════════════════════════════════
exports.listVideos = (req, res) => {
  try {
    const log = readLog();
    res.json({ ok: true, total: log.length, max: MAX_VIDEOS, data: log });
  } catch (e) {
    console.error("❌ listVideos:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  DELETE /video/:id
// ══════════════════════════════════════════════
exports.deleteVideo = (req, res) => {
  try {
    const id = Number(req.params.id);
    const log = readLog();
    const idx = log.findIndex((v) => v.id === id);
    if (idx === -1) return res.status(404).json({ message: "Video not found" });

    const entry = log[idx];
    const filePath = path.join(VIDEO_DIR, entry.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    log.splice(idx, 1);
    writeLog(log);

    console.log(
      `🗑️ Video deleted: ${entry.filename} (${log.length}/${MAX_VIDEOS})`
    );
    res.json({
      ok: true,
      id,
      filename: entry.filename,
      count: log.length,
      max: MAX_VIDEOS,
    });
  } catch (e) {
    console.error("❌ deleteVideo:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  POST /video/send-to-device
//  body: { urls[], deviceId?, merchant_id?, branch_id? }
//  ส่ง 3 แบบ:
//  1. deviceId    → ส่งตรงไปที่ device
//  2. merchant_id → broadcast ทุก device ของ merchant
//  3. branch_id   → broadcast ทุก device ใน branch
// ══════════════════════════════════════════════
exports.sendVideoToDevice = async (req, res) => {
  try {
    const { urls, deviceId, merchant_id, branch_id } = req.body;

    // ✅ validate urls array
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ message: "urls (array) required" });
    }
    if (!deviceId && !merchant_id && !branch_id) {
      return res.status(400).json({
        message: "ต้องระบุ deviceId, merchant_id หรือ branch_id",
      });
    }

    // ✅ payload ส่ง urls array ไปที่ ESP32
    const payload = {
      cmd: "download-video",
      urls, // array ของ URL ทุก video
      count: urls.length,
    };

    const results = [];

    // ── แบบที่ 1: ส่งตรงไปที่ device ──
    if (deviceId) {
      const topic = `${MQTT_PREFIX}/${deviceId}/cmd`;
      client.publish(topic, JSON.stringify(payload), { qos: 1 });
      console.log(`📤 Video[${urls.length}] → device: ${deviceId}`);
      results.push({ deviceId, ok: true });
    }

    // ── แบบที่ 2: broadcast by merchant_id ──
    if (merchant_id) {
      const [rows] = await db.query(
        "SELECT device_id FROM devices WHERE merchant_id = ?",
        [merchant_id]
      );
      for (const row of rows) {
        const topic = `${MQTT_PREFIX}/${row.device_id}/cmd`;
        client.publish(topic, JSON.stringify(payload), { qos: 1 });
        console.log(
          `📤 Video[${urls.length}] → merchant[${merchant_id}] device: ${row.device_id}`
        );
        results.push({ deviceId: row.device_id, ok: true });
      }
    }

    // ── แบบที่ 3: broadcast by branch_id ──
    if (branch_id) {
      const [rows] = await db.query(
        "SELECT device_id FROM devices WHERE branch_id = ?",
        [branch_id]
      );
      for (const row of rows) {
        const topic = `${MQTT_PREFIX}/${row.device_id}/cmd`;
        client.publish(topic, JSON.stringify(payload), { qos: 1 });
        console.log(
          `📤 Video[${urls.length}] → branch[${branch_id}] device: ${row.device_id}`
        );
        results.push({ deviceId: row.device_id, ok: true });
      }
    }

    res.json({
      ok: true,
      urls,
      count: urls.length,
      sent: results.length,
      results,
    });
  } catch (e) {
    console.error("❌ sendVideoToDevice:", e.message);
    res.status(500).json({ message: e.message });
  }
};
