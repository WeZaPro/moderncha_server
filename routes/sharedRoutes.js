const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const db = require("../models/db");
const bcrypt = require("bcrypt");

router.use(auth);

// ── GET /api/me — ดู profile ตัวเอง
router.get("/me", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length)
      return res.status(404).json({ message: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── POST /api/auth/change-password — เปลี่ยนรหัสผ่าน
router.post("/auth/change-password", async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "oldPassword and newPassword required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "newPassword must be at least 6 characters" });
    }

    const [rows] = await db.query("SELECT password FROM users WHERE id = ?", [
      req.user.id,
    ]);

    const match = await bcrypt.compare(oldPassword, rows[0].password);
    if (!match) return res.status(400).json({ message: "Wrong old password" });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hash,
      req.user.id,
    ]);

    res.json({ ok: true, message: "Password changed successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
// ```

// ---

// ## สรุป Route ทั้งหมด + Protection
// ```
// /login      → public   (ถ้า login แล้วจะ redirect ออก)
// /profile    → 🔒 ทุก role (admin + merchant)
// /admin      → 🔒 admin เท่านั้น
// /merchant   → 🔒 merchant เท่านั้น
// /           → redirect ตาม role อัตโนมัติ
// /*          → redirect /
