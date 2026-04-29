const db = require("../models/db");
const bcrypt = require("bcrypt");

// ── helper คำนวณ expired_at (+45 วัน) ──
function getExpiredAt() {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  return d.toISOString().slice(0, 19).replace("T", " "); // "YYYY-MM-DD HH:MM:SS"
}

// ── CREATE USER (any role)
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "name, email, password, role required" });

    const [existingEmail] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existingEmail.length) return res.status(409).json({ message: "Email already exists" });

    const [existingName] = await db.query("SELECT id FROM users WHERE name = ?", [name]);
    if (existingName.length) return res.status(409).json({ message: "Name already exists" });

    const hash = await bcrypt.hash(password, 10);
    // admin ไม่หมดอายุ, merchant/service หมดอายุ 45 วัน
    const expired_at = role === "admin" ? null : getExpiredAt();

    const [result] = await db.query(
      "INSERT INTO users (name, email, password, role, expired_at) VALUES (?, ?, ?, ?, ?)",
      [name, email, hash, role, expired_at]
    );
    res.json({ ok: true, id: result.insertId, name, email, role, expired_at });
  } catch (e) {
    console.error("❌ createUser:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── CREATE MERCHANT
exports.createMerchant = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "name, email, password required" });

    const [existingEmail] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existingEmail.length) return res.status(409).json({ message: "Email already exists" });

    const [existingName] = await db.query("SELECT id FROM users WHERE name = ?", [name]);
    if (existingName.length) return res.status(409).json({ message: "Name already exists" });

    const hash = await bcrypt.hash(password, 10);
    const expired_at = getExpiredAt(); // +45 วัน

    const [result] = await db.query(
      "INSERT INTO users (name, email, password, role, expired_at) VALUES (?, ?, ?, 'merchant', ?)",
      [name, email, hash, expired_at]
    );
    res.json({ ok: true, id: result.insertId, name, email, role: "merchant", expired_at });
  } catch (e) {
    console.error("❌ createMerchant:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── CREATE SERVICE
exports.createService = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "name, email, password required" });

    const [existingEmail] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existingEmail.length) return res.status(409).json({ message: "Email already exists" });

    const [existingName] = await db.query("SELECT id FROM users WHERE name = ?", [name]);
    if (existingName.length) return res.status(409).json({ message: "Name already exists" });

    const hash = await bcrypt.hash(password, 10);
    const expired_at = getExpiredAt(); // +45 วัน

    const [result] = await db.query(
      "INSERT INTO users (name, email, password, role, expired_at) VALUES (?, ?, ?, 'service', ?)",
      [name, email, hash, expired_at]
    );
    res.json({ ok: true, id: result.insertId, name, email, role: "service", expired_at });
  } catch (e) {
    console.error("❌ createService:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── DELETE USER (admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === req.user.id)
      return res.status(400).json({ message: "Cannot delete yourself" });

    const [rows] = await db.query(
      "SELECT id, name, email, role FROM users WHERE id = ?", [id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    await db.query("DELETE FROM refresh_tokens WHERE user_id = ?", [id]);
    await db.query("DELETE FROM users WHERE id = ?", [id]);

    console.log(`🗑️ User deleted: id=${id} email=${rows[0].email}`);
    res.json({ ok: true, deleted: rows[0] });
  } catch (e) {
    console.error("❌ deleteUser:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── GET ALL USERS (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;

    let sql = "SELECT id, name, email, role, created_at, expired_at FROM users WHERE 1=1";
    const params = [];

    if (role) { sql += " AND role = ?"; params.push(role); }
    sql += " ORDER BY created_at DESC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error("❌ getAllUsers:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── GET USER BY ID (admin only)
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT id, name, email, role, created_at, expired_at FROM users WHERE id = ?", [id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("❌ getUserById:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── UPDATE USER
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, expired_at, extend_days } = req.body;

    const [rows] = await db.query("SELECT id, role FROM users WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const fields = [];
    const values = [];

    if (name !== undefined) {
      const [dup] = await db.query("SELECT id FROM users WHERE name = ? AND id != ?", [name, id]);
      if (dup.length) return res.status(409).json({ message: "Name already exists" });
      fields.push("name = ?"); values.push(name);
    }
    if (email !== undefined) {
      const [dup] = await db.query("SELECT id FROM users WHERE email = ? AND id != ?", [email, id]);
      if (dup.length) return res.status(409).json({ message: "Email already exists" });
      fields.push("email = ?"); values.push(email);
    }
    if (password !== undefined) {
      if (password.length < 6)
        return res.status(400).json({ message: "Password min 6 characters" });
      const hash = await bcrypt.hash(password, 10);
      fields.push("password = ?"); values.push(hash);
    }
    if (role !== undefined) {
      if (!["admin", "merchant", "service"].includes(role))
        return res.status(400).json({ message: "role must be admin, merchant or service" });
      fields.push("role = ?"); values.push(role);
    }
    // ✅ ตั้ง expired_at ตรงๆ (ส่ง null เพื่อยกเลิกการหมดอายุ)
    if (expired_at !== undefined) {
      fields.push("expired_at = ?"); values.push(expired_at || null);
    }
    // ✅ ต่ออายุ N วันจากวันนี้ (เช่น extend_days=45)
    if (extend_days !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() + Number(extend_days));
      const newExpiry = d.toISOString().slice(0, 19).replace("T", " ");
      fields.push("expired_at = ?"); values.push(newExpiry);
    }

    if (!fields.length)
      return res.status(400).json({ message: "No valid fields to update" });

    values.push(id);
    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);

    console.log(`✅ User updated: id=${id} fields=[${fields.join(", ")}]`);
    res.json({ ok: true, id: Number(id), updated: fields.length });
  } catch (e) {
    console.error("❌ updateUser:", e.message);
    res.status(500).json({ message: e.message });
  }
};
