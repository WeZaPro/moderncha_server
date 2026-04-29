const db = require("../models/db");

// ดู all device ไม่สน merchant
// GET /api/admin/devices?merchant_id=11  (optional filter)
// ── สำหรับ admin — GET /api/admin/devices?merchant_id=xx (optional)
exports.getMyDevices = async (req, res) => {
  try {
    const { merchant_id } = req.query;

    let sql = "SELECT * FROM devices";
    const params = [];

    if (merchant_id) {
      sql += " WHERE merchant_id = ?";
      params.push(merchant_id);
    }

    sql += " ORDER BY created_at DESC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error("❌ getMyDevices:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── สำหรับ merchant — GET /api/merchant/devices (กรองจาก JWT อัตโนมัติ)
// exports.getMyOwnDevices = async (req, res) => {
//   try {
//     const [rows] = await db.query(
//       "SELECT * FROM devices WHERE merchant_id = ? ORDER BY created_at DESC",
//       [req.user.id]
//     );
//     res.json(rows);
//   } catch (e) {
//     console.error("❌ getMyOwnDevices:", e.message);
//     res.status(500).json({ message: e.message });
//   }
// };
exports.getMyOwnDevices = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const [rows] = await db.query(
      `SELECT device_id, name, branch_id, status, created_at, last_seen
       FROM devices
       WHERE merchant_id = ?
       ORDER BY created_at DESC`,
      [merchantId]
    );
    res.json(rows);
  } catch (e) {
    console.error("❌ getMyOwnDevices:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// merchantController.js — เพิ่ม function นี้
// exports.updateDevice = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name } = req.body;

//     if (!name) {
//       return res.status(400).json({ message: "name required" });
//     }

//     const [result] = await db.query(
//       "UPDATE devices SET name = ? WHERE id = ?",
//       [name, id]
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({ message: "Device not found" });
//     }

//     console.log(`✅ Device updated: id=${id} name=${name}`);
//     res.json({ ok: true, id: Number(id), name });
//   } catch (e) {
//     console.error("❌ updateDevice:", e.message);
//     res.status(500).json({ message: e.message });
//   }
// };

exports.updateDevice = async (req, res) => {
  try {
    const { id } = req.params; // id นี้คือ device_id string
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "name required" });
    }

    // ✅ แก้ WHERE id → WHERE device_id
    const [result] = await db.query(
      "UPDATE devices SET name = ? WHERE device_id = ?",
      [name, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Device not found" });
    }

    console.log(`✅ Device updated: device_id=${id} name=${name}`);
    res.json({ ok: true, device_id: id, name });
  } catch (e) {
    console.error("❌ updateDevice:", e.message);
    res.status(500).json({ message: e.message });
  }
};

exports.assignDevice = async (req, res) => {
  try {
    const { device_id, merchant_id, branch_id, name } = req.body;

    if (!device_id || !merchant_id) {
      return res
        .status(400)
        .json({ message: "device_id and merchant_id required" });
    }

    const [userRows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'merchant'",
      [merchant_id]
    );
    if (!userRows.length) {
      return res.status(404).json({ message: "merchant not found" });
    }

    // ✅ ถ้า device มีอยู่แล้ว (auto-registered) → UPDATE แทน INSERT
    const [existing] = await db.query(
      "SELECT id, merchant_id FROM devices WHERE device_id = ?",
      [device_id]
    );

    if (existing.length) {
      // ✅ UPDATE merchant_id, branch_id, name
      await db.query(
        `UPDATE devices 
         SET merchant_id = ?, branch_id = ?, name = ?
         WHERE device_id = ?`,
        [merchant_id, branch_id || null, name || device_id, device_id]
      );
      console.log(`✅ Device assigned: ${device_id} → merchant=${merchant_id}`);
      return res.json({
        ok: true,
        device_id,
        merchant_id,
        branch_id,
        name,
        action: "updated",
      });
    }

    // ✅ ไม่มีใน DB → INSERT ใหม่
    await db.query(
      "INSERT INTO devices (device_id, merchant_id, branch_id, name) VALUES (?, ?, ?, ?)",
      [device_id, merchant_id, branch_id || null, name || device_id]
    );
    console.log(`✅ Device inserted: ${device_id} → merchant=${merchant_id}`);
    res.json({
      ok: true,
      device_id,
      merchant_id,
      branch_id,
      name,
      action: "inserted",
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "device already assigned" });
    }
    console.error("❌ assignDevice:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── DELETE /api/admin/devices/unassign
exports.unassignDevice = async (req, res) => {
  try {
    const { device_id } = req.body;

    if (!device_id) {
      return res.status(400).json({ message: "device_id required" });
    }

    const [result] = await db.query("DELETE FROM devices WHERE device_id = ?", [
      device_id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "device not found" });
    }

    res.json({ ok: true, device_id });
  } catch (e) {
    console.error("❌ unassignDevice:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── GET /api/merchant/orders
exports.getMyOrders = async (req, res) => {
  console.log("my order");
  try {
    const merchantId = req.user.id;
    const { status, limit = 50, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let sql = "SELECT * FROM orders WHERE merchant_id = ?";
    let params = [merchantId];

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);

    const [rows] = await db.query(sql, params);

    // นับ total
    let countSql = "SELECT COUNT(*) as total FROM orders WHERE merchant_id = ?";
    let countParams = [merchantId];
    if (status) {
      countSql += " AND status = ?";
      countParams.push(status);
    }
    const [[{ total }]] = await db.query(countSql, countParams);

    res.json({ total, page: Number(page), limit: Number(limit), data: rows });
  } catch (e) {
    console.error("❌ getMyOrders:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── GET /api/admin/orders (admin เห็นทุก merchant)
exports.getAllOrders = async (req, res) => {
  console.log("getAllOrders");
  try {
    const { merchant_id, status, limit = 100, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let sql = `SELECT o.*, u.name AS merchant_name, u.email AS merchant_email,
           d.branch_id
           FROM orders o
           JOIN users u ON o.merchant_id = u.id
           LEFT JOIN devices d ON d.device_id = o.device_id
           WHERE 1=1`;
    let params = [];

    if (merchant_id) {
      sql += " AND o.merchant_id = ?";
      params.push(merchant_id);
    }
    if (status) {
      sql += " AND o.status = ?";
      params.push(status);
    }

    sql += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);

    const [rows] = await db.query(sql, params);

    // นับ total
    let countSql = "SELECT COUNT(*) as total FROM orders o WHERE 1=1";
    let countParams = [];
    if (merchant_id) {
      countSql += " AND o.merchant_id = ?";
      countParams.push(merchant_id);
    }
    if (status) {
      countSql += " AND o.status = ?";
      countParams.push(status);
    }
    const [[{ total }]] = await db.query(countSql, countParams);

    res.json({ total, page: Number(page), limit: Number(limit), data: rows });
  } catch (e) {
    console.error("❌ getAllOrders:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── GET /api/admin/merchants (admin ดูรายชื่อ merchant ทั้งหมด)
exports.getAllMerchants = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.created_at,
              COUNT(d.id) AS device_count
       FROM users u
       LEFT JOIN devices d ON d.merchant_id = u.id
       WHERE u.role = 'merchant'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    res.json(rows);
  } catch (e) {
    console.error("❌ getAllMerchants:", e.message);
    res.status(500).json({ message: e.message });
  }
};
