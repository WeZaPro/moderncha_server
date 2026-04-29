const jwt = require("jsonwebtoken");
const db = require("../models/db");
const config = require("../config/jwt");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ไม่มี token เลย
  if (!authHeader) {
    return res.status(401).json({ message: "No token" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    // ✅ accessToken ยังใช้ได้ → ผ่านเลย
    req.user = jwt.verify(accessToken, config.accessSecret);
    return next();
  } catch (err) {
    // token ผิดรูปแบบ (ไม่ใช่แค่หมดอายุ)
    if (err.name !== "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid token" });
    }

    // ✅ token หมดอายุ → ลอง auto refresh
    const refreshToken = req.headers["x-refresh-token"];

    if (!refreshToken) {
      return res.status(401).json({
        message: "Token expired",
        expired: true,
      });
    }

    try {
      // ตรวจ refreshToken
      const decoded = jwt.verify(refreshToken, config.refreshSecret);

      // เช็คใน DB ว่ายังไม่ถูก logout
      const [rows] = await db.query(
        `SELECT rt.*, u.role
         FROM refresh_tokens rt
         JOIN users u ON rt.user_id = u.id
         WHERE rt.token = ? AND rt.expires_at > NOW()`,
        [refreshToken]
      );

      if (!rows.length) {
        return res.status(401).json({
          message: "Session expired — please login again",
          expired: true,
        });
      }

      // ออก accessToken ใหม่
      const newAccessToken = jwt.sign(
        { id: decoded.id, role: rows[0].role },
        config.accessSecret,
        { expiresIn: config.accessExpiresIn }
      );

      // ส่ง token ใหม่กลับใน response header
      res.setHeader("x-new-access-token", newAccessToken);

      // set req.user ให้ route ถัดไปใช้ได้เลย
      req.user = { id: decoded.id, role: rows[0].role };

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
// ```

// ---

// ## วิธีใช้ใน Postman
// ```
// # ส่ง 2 header นี้ทุกครั้ง
// Authorization:   Bearer <ACCESS_TOKEN>
// x-refresh-token: <REFRESH_TOKEN>

// # ถ้า access หมดอายุ response จะมี header
// x-new-access-token: eyJhbGci...  ← เอาไปใช้แทนอันเก่า
// ```

// ---

// ## สรุป behavior
// ```
// มี accessToken ถูกต้อง        → ✅ ผ่านเลย
// ไม่มี token                   → 401 "No token"
// token ผิดรูปแบบ               → 401 "Invalid token"
// token หมด + ไม่มี refreshToken → 401 "Token expired" + expired: true
// token หมด + มี refreshToken   → 🔄 auto refresh → ✅ ผ่าน + ส่ง x-new-access-token
// refreshToken หมด/ถูก logout   → 401 "Session expired" + expired: true
