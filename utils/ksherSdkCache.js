// utils/ksherSdkCache.js
const KsherPay = require("@kshersolution/ksher");
const db = require("../models/db");
const fs = require("fs");
const path = require("path");
const os = require("os");

const cache = new Map(); // merchant_id → { sdk, config, loadedAt }
const CACHE_TTL = 5 * 60 * 1000; // 5 นาที

// ✅ เขียน PEM string ลงไฟล์ temp แล้วคืน path
// KSher SDK รับแค่ file path ไม่รับ string โดยตรง
function writeTempKey(merchantId, pemString) {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `ksher_key_${merchantId}.pem`);
  fs.writeFileSync(filePath, pemString, "utf8");
  return filePath;
}

async function getSdkByMerchantId(merchantId) {
  const now = Date.now();
  const cached = cache.get(merchantId);

  if (cached && now - cached.loadedAt < CACHE_TTL) {
    return cached;
  }

  const [rows] = await db.query(
    "SELECT ksher_appid, ksher_key, ksher_notify_url FROM merchant_configs WHERE merchant_id = ?",
    [merchantId]
  );

  if (!rows.length) {
    throw new Error(`No KSher config for merchant_id=${merchantId}`);
  }

  const config = rows[0];

  // ✅ เขียน PEM ลงไฟล์ temp → ส่ง path ให้ SDK
  const keyPath = writeTempKey(merchantId, config.ksher_key);
  const sdk = new KsherPay(config.ksher_appid, keyPath);

  const entry = { sdk, config, loadedAt: now };
  cache.set(merchantId, entry);

  console.log(
    `✅ KSher SDK loaded for merchant_id=${merchantId} keyPath=${keyPath}`
  );
  return entry;
}

async function getSdkByDeviceId(deviceId) {
  const [rows] = await db.query(
    "SELECT merchant_id FROM devices WHERE device_id = ?",
    [deviceId]
  );

  if (!rows.length) {
    throw new Error(`Device not found or not assigned: ${deviceId}`);
  }

  const merchantId = rows[0].merchant_id;
  return { merchantId, ...(await getSdkByMerchantId(merchantId)) };
}

function invalidate(merchantId) {
  cache.delete(merchantId);
  // ลบไฟล์ temp ด้วย
  try {
    const filePath = path.join(os.tmpdir(), `ksher_key_${merchantId}.pem`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
  console.log(`🗑️ KSher SDK cache cleared for merchant_id=${merchantId}`);
}

module.exports = { getSdkByMerchantId, getSdkByDeviceId, invalidate };
