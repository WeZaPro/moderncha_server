// controllers/merchantConfigController.js
const db = require("../models/db");
const { invalidate } = require("../utils/ksherSdkCache");
const fs = require("fs");

// ── normalize PEM ──────────────────────────
function normalizePem(raw) {
  if (!raw) return raw;

  let pem = raw.replace(/\\n/g, "\n");

  const headerMatch = pem.match(/-----BEGIN [^-]+-----/);
  const footerMatch = pem.match(/-----END [^-]+-----/);

  if (!headerMatch || !footerMatch) {
    throw new Error("Invalid PEM format — missing BEGIN/END header");
  }

  const header = headerMatch[0];
  const footer = footerMatch[0];

  let body = pem.replace(header, "").replace(footer, "").replace(/\s+/g, "");

  const chunks = body.match(/.{1,64}/g) || [];
  return `${header}\n${chunks.join("\n")}\n${footer}`;
}

// ── GET /api/admin/merchant-configs
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT mc.id, mc.merchant_id, u.name, u.email,
              mc.ksher_appid, mc.ksher_notify_url, mc.updated_at
       FROM merchant_configs mc
       JOIN users u ON u.id = mc.merchant_id
       ORDER BY mc.updated_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── GET /api/admin/merchant-configs/:merchantId
exports.getOne = async (req, res) => {
  try {
    const { merchantId } = req.params;
    const [rows] = await db.query(
      `SELECT mc.id, mc.merchant_id, u.name, u.email,
              mc.ksher_appid, mc.ksher_notify_url, mc.updated_at
       FROM merchant_configs mc
       JOIN users u ON u.id = mc.merchant_id
       WHERE mc.merchant_id = ?`,
      [merchantId]
    );
    if (!rows.length)
      return res.status(404).json({ message: "Config not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};


// ══════════════════════════════════════════════
//  PUT /api/admin/merchant-configs/:merchantId
//  ✅ UPDATE เฉพาะ field ที่ส่งมา (partial update)
//  รองรับ 2 แบบ:
//    1. JSON body
//    2. multipart/form-data + ksher_key_file (.pem)
// ══════════════════════════════════════════════
exports.update = async (req, res) => {
  try {
    const { merchantId } = req.params;
 
    // ตรวจว่ามี config อยู่แล้ว
    const [existing] = await db.query(
      "SELECT id FROM merchant_configs WHERE merchant_id = ?",
      [merchantId]
    );
    if (!existing.length) {
      return res.status(404).json({ message: "Merchant config not found" });
    }
 
    // อ่านค่าที่จะ update
    const { ksher_appid, ksher_notify_url } = req.body;
    let ksher_key = req.body.ksher_key || null;
 
    // ถ้ามีไฟล์ .pem อัปโหลด → อ่านแทน
    if (req.file) {
      ksher_key = fs.readFileSync(req.file.path, "utf8").trim();
      fs.unlinkSync(req.file.path);
    }
 
    // build dynamic SET clause — เฉพาะ field ที่ส่งมา
    const fields = [];
    const values = [];
 
    if (ksher_appid !== undefined) {
      fields.push("ksher_appid = ?");
      values.push(ksher_appid);
    }
    if (ksher_key !== null) {
      fields.push("ksher_key = ?");
      values.push(ksher_key);
    }
    if (ksher_notify_url !== undefined) {
      fields.push("ksher_notify_url = ?");
      values.push(ksher_notify_url);
    }
 
    if (!fields.length) {
      return res.status(400).json({
        message: "No valid fields to update: ksher_appid, ksher_key, ksher_notify_url",
      });
    }
 
    values.push(merchantId);
    await db.query(
      `UPDATE merchant_configs SET ${fields.join(", ")}, updated_at = NOW() WHERE merchant_id = ?`,
      values
    );
 
    console.log(`✅ merchant-config updated: merchant=${merchantId} fields=${fields.length}`);
    res.json({ ok: true, merchant_id: Number(merchantId), updated: fields.length });
  } catch (e) {
    if (req.file) fs.existsSync(req.file.path) && fs.unlinkSync(req.file.path);
    console.error("❌ update merchant-config:", e.message);
    res.status(500).json({ message: e.message });
  }
};
 



// ── POST /api/admin/merchant-configs
//  รองรับ 2 แบบ:
//  1. multipart/form-data + file upload (ksher_key_file)
//  2. application/json (ksher_key เป็น string)
exports.upsert = async (req, res) => {
  try {
    const { merchant_id, ksher_appid, ksher_notify_url } = req.body;

    if (!merchant_id || !ksher_appid || !ksher_notify_url) {
      return res.status(400).json({
        message: "merchant_id, ksher_appid, ksher_notify_url required",
      });
    }

    // ── อ่าน key ──────────────────────────
    let rawKey = "";

    if (req.file) {
      // ✅ แบบที่ 1: upload ไฟล์ .pem
      rawKey = fs.readFileSync(req.file.path, "utf8");
      // ลบไฟล์ temp หลังอ่านแล้ว
      fs.unlinkSync(req.file.path);
      console.log(`📄 PEM file uploaded: ${req.file.originalname}`);
    } else if (req.body.ksher_key) {
      // ✅ แบบที่ 2: ส่งเป็น string ใน JSON
      rawKey = req.body.ksher_key;
    } else {
      return res.status(400).json({
        message: "ksher_key required — upload .pem file or send as string",
      });
    }

    // ── ตรวจ merchant ──────────────────────
    const [userRows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'merchant'",
      [merchant_id]
    );
    if (!userRows.length) {
      return res.status(404).json({ message: "merchant not found" });
    }

    // ── normalize PEM ──────────────────────
    let normalizedKey;
    try {
      normalizedKey = normalizePem(rawKey);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    // ── save ───────────────────────────────
    await db.query(
      `INSERT INTO merchant_configs (merchant_id, ksher_appid, ksher_key, ksher_notify_url)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ksher_appid      = VALUES(ksher_appid),
         ksher_key        = VALUES(ksher_key),
         ksher_notify_url = VALUES(ksher_notify_url)`,
      [merchant_id, ksher_appid, normalizedKey, ksher_notify_url]
    );

    invalidate(Number(merchant_id));

    console.log(
      `✅ merchant_configs saved: merchant_id=${merchant_id} appid=${ksher_appid}`
    );

    res.json({ ok: true, merchant_id, ksher_appid, ksher_notify_url });
  } catch (e) {
    console.error("❌ upsertMerchantConfig:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── DELETE /api/admin/merchant-configs/:merchantId
exports.remove = async (req, res) => {
  try {
    const { merchantId } = req.params;
    await db.query("DELETE FROM merchant_configs WHERE merchant_id = ?", [
      merchantId,
    ]);
    invalidate(Number(merchantId));
    res.json({ ok: true, merchant_id: merchantId });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
