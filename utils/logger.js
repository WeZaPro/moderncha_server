const fs = require("fs");
const path = require("path");

// โฟลเดอร์เก็บ logs
const LOG_DIR = path.join(__dirname, "../logs");

// สร้างโฟลเดอร์ถ้าไม่มี
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * ฟังก์ชันคืนชื่อไฟล์ log ของวันนี้
 * ตัวอย่าง: logs/device_2026-03-20.json
 */
function getLogFilePath() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `device_${today}.json`);
}

/**
 * ฟังก์ชันบันทึก log
 * entry = object เช่น { deviceId, time, action, data }
 */
function saveLog(entry) {
  try {
    const LOG_FILE = getLogFilePath();

    // โหลด log เดิมถ้ามี
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, "utf8");
      logs = raw ? JSON.parse(raw) : [];
    }

    // เพิ่ม entry ใหม่
    logs.push(entry);

    // จำกัดไม่ให้ไฟล์ใหญ่เกิน (เก็บล่าสุด 1000 รายการ)
    if (logs.length > 1000) {
      logs.shift();
    }

    // เขียนกลับไฟล์
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.log("❌ LOG WRITE ERROR:", err.message);
  }
}

module.exports = { saveLog };
