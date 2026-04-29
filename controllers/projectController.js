const db = require("../models/db");
const crypto = require("crypto");

// ── auto generate branch_id
function generateBranchId() {
  return "br-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

// ══════════════════════════════════════════════
//  POST /api/merchant/project/create
// ══════════════════════════════════════════════
exports.createProject = async (req, res) => {
  try {
    // const merchantId = req.user.id;
    const { merchantId, project_name, image_logo, address, contact } = req.body;

    if (!project_name) {
      return res.status(400).json({ message: "project_name required" });
    }

    // ✅ auto generate branch_id
    const branch_id = generateBranchId();

    const [result] = await db.query(
      `INSERT INTO projects 
        (merchant_id, branch_id, project_name, image_logo, address, contact)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        merchantId,
        branch_id,
        project_name,
        image_logo || null,
        address || null,
        contact || null,
      ]
    );

    console.log(
      `✅ Project created: id=${result.insertId} branch=${branch_id} merchant=${merchantId}`
    );

    res.json({
      ok: true,
      id: result.insertId,
      merchant_id: merchantId,
      branch_id,
      project_name,
      image_logo: image_logo || null,
      address: address || null,
      contact: contact || null,
    });
  } catch (e) {
    console.error("❌ createProject:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  GET /api/merchant/project/:id
//  ดู project เดียว by id
//  admin → ดูได้ทุก project
//  merchant → ดูได้เฉพาะของตัวเอง
// ══════════════════════════════════════════════
exports.getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    let sql = `
      SELECT p.id, p.merchant_id, p.branch_id, p.project_name,
             p.image_logo, p.address, p.contact,
             p.created_at, p.updated_at,
             u.name AS merchant_name, u.email AS merchant_email,
             COUNT(DISTINCT d.id) AS device_count
      FROM projects p
      LEFT JOIN users u ON u.id = p.merchant_id
      LEFT JOIN devices d ON d.branch_id = p.branch_id
      WHERE p.id = ?
    `;
    const params = [id];

    // merchant ดูได้เฉพาะของตัวเอง
    if (role === "merchant") {
      sql += " AND p.merchant_id = ?";
      params.push(userId);
    }

    sql += " GROUP BY p.id";

    const [rows] = await db.query(sql, params);

    if (!rows.length) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error("❌ getProjectById:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  GET /api/merchant/project
//  ดู project ของ merchant ตัวเอง
// ══════════════════════════════════════════════
exports.getMyProjects = async (req, res) => {
  try {
    const merchantId = req.user.id;

    const [rows] = await db.query(
      `SELECT id, branch_id, project_name, image_logo, address, contact, created_at
       FROM projects
       WHERE merchant_id = ?
       ORDER BY created_at DESC`,
      [merchantId]
    );

    res.json(rows);
  } catch (e) {
    console.error("❌ getMyProjects:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  PUT /api/merchant/project/:id
//  แก้ไข project
// ══════════════════════════════════════════════
exports.updateProject = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { id } = req.params;
    const { project_name, image_logo, address, contact } = req.body;

    // ✅ admin แก้ได้ทุก project
    let checkSql = "SELECT id FROM projects WHERE id = ?";
    const checkParams = [id];
    if (role === "merchant") {
      checkSql += " AND merchant_id = ?";
      checkParams.push(userId);
    }

    const [rows] = await db.query(checkSql, checkParams);
    if (!rows.length)
      return res.status(404).json({ message: "Project not found" });

    await db.query(
      "UPDATE projects SET project_name=?, image_logo=?, address=?, contact=? WHERE id=?",
      [project_name, image_logo || null, address || null, contact || null, id]
    );

    res.json({ ok: true, id: Number(id), project_name, address, contact });
  } catch (e) {
    console.error("❌ updateProject:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  DELETE /api/merchant/project/:id
// ══════════════════════════════════════════════
exports.deleteProject = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { id } = req.params;

    // ✅ admin ดูได้ทุก project, merchant ดูได้เฉพาะของตัวเอง
    let sql = "SELECT id, project_name FROM projects WHERE id = ?";
    const params = [id];

    if (role === "merchant") {
      sql += " AND merchant_id = ?";
      params.push(userId);
    }

    const [rows] = await db.query(sql, params);
    if (!rows.length) {
      return res.status(404).json({ message: "Project not found" });
    }

    await db.query("DELETE FROM projects WHERE id = ?", [id]);

    console.log(`🗑️ Project deleted: id=${id} by ${role}=${userId}`);
    res.json({ ok: true, deleted: rows[0] });
  } catch (e) {
    console.error("❌ deleteProject:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  GET /api/project
//  admin → ดูทั้งหมด หรือ filter ?merchant_id=xx
//  merchant → ดูเฉพาะของตัวเอง
// ══════════════════════════════════════════════
exports.getMyProjects = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { merchant_id } = req.query;

    let sql = `
      SELECT p.id, p.merchant_id, p.branch_id, p.project_name,
             p.image_logo, p.address, p.contact, p.created_at,
             u.name AS merchant_name,
             COUNT(DISTINCT d.id) AS device_count
      FROM projects p
      LEFT JOIN users u ON u.id = p.merchant_id
      LEFT JOIN devices d ON d.branch_id = p.branch_id
      WHERE 1=1
    `;
    const params = [];

    if (role === "merchant") {
      // merchant ดูเฉพาะของตัวเอง
      sql += " AND p.merchant_id = ?";
      params.push(userId);
    } else if (merchant_id) {
      // admin + filter
      sql += " AND p.merchant_id = ?";
      params.push(merchant_id);
    }

    sql += " GROUP BY p.id ORDER BY p.created_at DESC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error("❌ getMyProjects:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  GET /api/project/device-config/:device_id
// ══════════════════════════════════════════════
// exports.getDeviceConfig = async (req, res) => {
//   try {
//     const { device_id } = req.params;
//     const [rows] = await db.query(
//       "SELECT * FROM device_configs WHERE device_id = ?",
//       [device_id]
//     );
//     if (!rows.length)
//       return res.status(404).json({ message: "Config not found" });
//     res.json(rows[0]);
//   } catch (e) {
//     console.error("❌ getDeviceConfig:", e.message);
//     res.status(500).json({ message: e.message });
//   }
// };
exports.getDeviceConfig = async (req, res) => {
  try {
    const { device_id } = req.params;
    console.log(`📥 getDeviceConfig: ${device_id}`);
    const [rows] = await db.query(
      "SELECT * FROM device_configs WHERE device_id = ?",
      [device_id]
    );
    if (!rows.length)
      return res.status(404).json({ message: "Config not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("❌ getDeviceConfig:", e.message);
    res.status(500).json({ message: e.message });
  }
};
// ══════════════════════════════════════════════
//  PUT /api/project/device-config/:device_id
// ══════════════════════════════════════════════
exports.updateDeviceConfig = async (req, res) => {
  try {
    const { device_id } = req.params;
    const {
      t_total,
      bact_s,
      bact_e,
      ozone_s,
      ozone_e,
      perfume_s,
      perfume_e,
      dust_s,
      dust_e,
      uv_s,
      uv_e,
      dry_s,
      dry_e,
    } = req.body;

    const [existing] = await db.query(
      "SELECT id FROM device_configs WHERE device_id = ?",
      [device_id]
    );
    if (!existing.length)
      return res.status(404).json({ message: "Config not found" });

    await db.query(
      `UPDATE device_configs SET
        t_total=?, bact_s=?, bact_e=?,
        ozone_s=?, ozone_e=?,
        perfume_s=?, perfume_e=?,
        dust_s=?, dust_e=?,
        uv_s=?, uv_e=?,
        dry_s=?, dry_e=?
       WHERE device_id = ?`,
      [
        t_total ?? 480,
        bact_s ?? 0,
        bact_e ?? 60,
        ozone_s ?? 60,
        ozone_e ?? 120,
        perfume_s ?? 120,
        perfume_e ?? 240,
        dust_s ?? 0,
        dust_e ?? 480,
        uv_s ?? 0,
        uv_e ?? 480,
        dry_s ?? 240,
        dry_e ?? 480,
        device_id,
      ]
    );

    console.log(`✅ updateDeviceConfig: ${device_id}`);
    res.json({ ok: true, device_id });
  } catch (e) {
    console.error("❌ updateDeviceConfig:", e.message);
    res.status(500).json({ message: e.message });
  }
};
