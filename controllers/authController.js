const db = require("../models/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("../config/jwt");
const axios = require("axios");
const { pushMessage, buildIncomeMessage } = require("../utils/lineNotify");

// helper
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role },
    config.accessSecret,
    { expiresIn: config.accessExpiresIn }
  );

  const refreshToken = jwt.sign({ id: user.id }, config.refreshSecret, {
    expiresIn: config.refreshExpiresIn,
  });

  return { accessToken, refreshToken };
};

// LOGIN
exports.login = async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

  if (!rows.length) {
    return res.status(400).json({ message: "User not found" });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(400).json({ message: "Wrong password" });
  }

  const { accessToken, refreshToken } = generateTokens(user);

  // save refresh token
  await db.query(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
    [user.id, refreshToken]
  );

  res.json({ accessToken, refreshToken });
};

// REFRESH TOKEN
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: "No refresh token" });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.refreshSecret);

    // check in DB
    const [rows] = await db.query(
      "SELECT * FROM refresh_tokens WHERE token = ?",
      [refreshToken]
    );

    if (!rows.length) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    // generate new access token
    const newAccessToken = jwt.sign({ id: decoded.id }, config.accessSecret, {
      expiresIn: config.accessExpiresIn,
    });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    return res
      .status(403)
      .json({ message: "Expired or invalid refresh token" });
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;

  await db.query("DELETE FROM refresh_tokens WHERE token = ?", [refreshToken]);

  res.json({ message: "Logged out" });
};

// authController.js
exports.getMe = async (req, res) => {
  const [rows] = await db.query(
    // ✅ เพิ่ม expired_at
    "SELECT id, name, email, role, created_at, expired_at FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json(rows[0]);
};

// ══════════════════════════════════════════════
//  POST /api/auth/line-callback
//  รับ LINE access_token จาก LIFF แล้วดึง userId
//  Body: { lineAccessToken }
//  ต้อง auth (merchant ต้อง login ก่อน)
// ══════════════════════════════════════════════
exports.saveLineUserId = async (req, res) => {
  try {
    const { lineAccessToken } = req.body;
    if (!lineAccessToken)
      return res.status(400).json({ message: "lineAccessToken required" });

    // ── verify token กับ LINE API เพื่อดึง userId
    const { data } = await axios.get("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${lineAccessToken}` },
    });

    const lineUserId = data.userId; // เช่น "U1234567890abcdef..."

    // ── save ลง users table
    await db.query("UPDATE users SET line_user_id = ? WHERE id = ?", [
      lineUserId,
      req.user.id,
    ]);

    console.log(`✅ LINE linked: user=${req.user.id} lineUserId=${lineUserId}`);
    res.json({ ok: true, lineUserId });
  } catch (e) {
    console.error("❌ saveLineUserId:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  DELETE /api/auth/line-unlink
//  ยกเลิกการผูก LINE
// ══════════════════════════════════════════════
exports.unlinkLine = async (req, res) => {
  try {
    await db.query("UPDATE users SET line_user_id = NULL WHERE id = ?", [
      req.user.id,
    ]);
    res.json({ ok: true, message: "LINE unlinked" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  POST /api/auth/line-test
//  ทดสอบส่ง LINE notify
// ══════════════════════════════════════════════
exports.testLineNotify = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT line_user_id, name FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!rows.length)
      return res.status(404).json({ message: "User not found" });

    const { line_user_id, name } = rows[0];

    if (!line_user_id)
      return res
        .status(400)
        .json({ message: "ยังไม่ได้เชื่อมต่อ LINE กรุณาเชื่อมต่อก่อน" });

    await pushMessage(line_user_id, [
      buildIncomeMessage({
        deviceName: "ทดสอบระบบ 🧪",
        method: "qr",
        price: 99,
        branchId: "TEST",
        createdAt: new Date().toISOString(),
      }),
    ]);

    console.log(
      `✅ LINE test sent → user=${req.user.id} lineUserId=${line_user_id}`
    );
    res.json({ ok: true, message: "ส่งแจ้งเตือนสำเร็จ" });
  } catch (e) {
    console.error("❌ testLineNotify:", e.message);
    res.status(500).json({ message: e.message });
  }
};
