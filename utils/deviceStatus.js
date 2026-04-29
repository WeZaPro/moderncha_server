const db = require("../models/db");

// กัน update ซ้ำ (ลด load DB)
const lastStatusMap = new Map();

async function updateDeviceStatus(deviceId, isOnline) {
  try {
    const newStatus = isOnline ? 1 : 0;

    // ✅ กันยิงซ้ำ (สำคัญมาก)
    if (lastStatusMap.get(deviceId) === newStatus) return;

    lastStatusMap.set(deviceId, newStatus);

    // ✅ UPDATE เพิ่ม last_seen
    await db.execute(
      "UPDATE devices SET status = ?, last_seen = ? WHERE device_id = ?",
      [newStatus, Date.now(), deviceId]
    );

    console.log(`💾 DB updated: ${deviceId} -> ${newStatus}`);
  } catch (err) {
    console.error("❌ updateDeviceStatus error:", err.message);
  }
}

module.exports = { updateDeviceStatus };
