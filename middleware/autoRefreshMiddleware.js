const jwt = require("jsonwebtoken");
const db = require("../models/db");
const config = require("../config/jwt");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return next();

  const accessToken = authHeader.split(" ")[1];

  try {
    // ✅ token ยังใช้ได้ → ผ่านเลย
    req.user = jwt.verify(accessToken, config.accessSecret);
    return next();
  } catch (err) {
    // ❌ token หมดอายุ → ลอง refresh อัตโนมัติ
    if (err.name !== "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid token" });
    }

    // รับ refreshToken จาก header หรือ body
    const refreshToken =
      req.headers["x-refresh-token"] || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Token expired — please provide refresh token",
        expired: true,
      });
    }

    try {
      // ตรวจ refreshToken
      const decoded = jwt.verify(refreshToken, config.refreshSecret);

      // เช็คใน DB ว่ายังใช้ได้อยู่
      const [rows] = await db.query(
        "SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()",
        [refreshToken]
      );

      if (!rows.length) {
        return res.status(401).json({
          message: "Refresh token expired — please login again",
          expired: true,
        });
      }

      // ออก accessToken ใหม่
      const newAccessToken = jwt.sign(
        { id: decoded.id, role: decoded.role || rows[0].role },
        config.accessSecret,
        { expiresIn: config.accessExpiresIn }
      );

      // ส่ง token ใหม่กลับใน header
      res.setHeader("x-new-access-token", newAccessToken);

      // set req.user ให้ route ถัดไปใช้ได้เลย
      req.user = jwt.verify(newAccessToken, config.accessSecret);

      console.log("🔄 Auto refreshed token for user:", decoded.id);

      return next();
    } catch (refreshErr) {
      return res.status(401).json({
        message: "Session expired — please login again",
        expired: true,
      });
    }
  }
};
