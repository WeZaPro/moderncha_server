// create_admin.js
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

async function main() {
  const db = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "", // ← เปลี่ยนตามจริง
    database: "iot_db",
  });

  const hash = await bcrypt.hash("admin1234", 10);

  await db.execute("DELETE FROM users WHERE email = ?", ["admin@example.com"]);

  await db.execute(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
    ["Super Admin", "admin@example.com", hash, "admin"]
  );

  console.log("✅ Admin created successfully");
  console.log("📧 Email   :", "admin@example.com");
  console.log("🔑 Password:", "admin1234");
  console.log("🔒 Hash    :", hash);

  await db.end();
}

main().catch(console.error);
