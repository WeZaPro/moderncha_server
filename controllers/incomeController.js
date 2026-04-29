const db = require("../models/db");
// const { pushMessage, buildIncomeMessage } = require("../utils/lineNotify");

// ══════════════════════════════════════════════
//  HELPER — ดึง device meta + line_user_id
//  ใช้ร่วมกันทุก function
// ══════════════════════════════════════════════
const getDeviceWithMerchant = async (deviceId) => {
  const [rows] = await db.query(
    `SELECT dc.device_id, dc.name AS device_name, dc.merchant_id, dc.branch_id,
            u.line_user_id
     FROM device_configs dc
     LEFT JOIN users u ON u.id = dc.merchant_id
     WHERE dc.device_id = ?`,
    [deviceId]
  );
  return rows[0] || null;
};

// ══════════════════════════════════════════════
//  HELPER — แปลง dateTime string
// ══════════════════════════════════════════════
const parseDateTimeStr = (dateTime) => {
  if (!dateTime) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const d = new Date(dateTime);
  if (isNaN(d)) return new Date().toISOString().slice(0, 19).replace("T", " ");
  return d.toISOString().slice(0, 19).replace("T", " ");
};

// ══════════════════════════════════════════════
//  POST /api/income/record
//  รับ order จาก ESP32 — ไม่ต้อง auth
//  Body: { device_id, price, method, datetime?, mode? }
// ══════════════════════════════════════════════
exports.recordIncome = async (req, res) => {
  try {
    const { device_id, price, method, datetime, mode } = req.body;

    if (!device_id)
      return res.status(400).json({ message: "device_id required" });
    if (!price || isNaN(Number(price)))
      return res.status(400).json({ message: "price required (number)" });

    const VALID_METHODS = ["qr", "cash", "coin"];
    if (!method || !VALID_METHODS.includes(method))
      return res
        .status(400)
        .json({ message: `method required: ${VALID_METHODS.join(", ")}` });

    // ── ดึงข้อมูลจาก device_configs + users
    const device = await getDeviceWithMerchant(device_id);
    if (!device)
      return res
        .status(404)
        .json({ message: `Device not found: ${device_id}` });

    const { device_name, merchant_id, branch_id, line_user_id } = device;

    // ── แปลง datetime หรือใช้ NOW()
    let createdAt = null;
    if (datetime) {
      const d = new Date(datetime);
      if (!isNaN(d)) createdAt = d.toISOString().slice(0, 19).replace("T", " ");
    }

    const values = createdAt
      ? [
          device_id,
          device_name,
          merchant_id,
          branch_id,
          method,
          Number(price),
          mode || "prod",
          createdAt,
        ]
      : [
          device_id,
          device_name,
          merchant_id,
          branch_id,
          method,
          Number(price),
          mode || "prod",
        ];

    const [result] = await db.query(
      `INSERT INTO income (device_id, device_name, merchant_id, branch_id, method, price, mode${
        createdAt ? ", created_at" : ""
      })
       VALUES (?, ?, ?, ?, ?, ?, ?${createdAt ? ", ?" : ""})`,
      values
    );

    console.log(
      `✅ Income recorded: id=${result.insertId} device=${device_id} method=${method} price=${price}`
    );

    // ── ส่ง LINE notify (non-blocking)
    // if (line_user_id && mode !== "test") {
    //   pushMessage(line_user_id, [
    //     buildIncomeMessage({
    //       deviceName: device_name,
    //       method,
    //       price,
    //       branchId: branch_id,
    //       createdAt: createdAt || null,
    //     }),
    //   ]);
    // }

    res.json({
      ok: true,
      id: result.insertId,
      device_id,
      device_name,
      merchant_id,
      branch_id,
      method,
      price: Number(price),
      mode: mode || "prod",
    });
  } catch (e) {
    console.error("❌ recordIncome:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  GET /api/income
//  admin → ดูทั้งหมด หรือ filter ?merchant_id=&device_id=&method=
//  merchant → ดูเฉพาะของตัวเอง
// ══════════════════════════════════════════════
exports.getIncome = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { merchant_id, device_id, method, limit = 100, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let sql = `
      SELECT i.*, u.name AS merchant_name
      FROM income i
      LEFT JOIN users u ON u.id = i.merchant_id
      WHERE 1=1
    `;
    const params = [];

    if (role === "merchant") {
      sql += " AND i.merchant_id = ?";
      params.push(userId);
    } else if (merchant_id) {
      sql += " AND i.merchant_id = ?";
      params.push(merchant_id);
    }

    if (device_id) {
      sql += " AND i.device_id = ?";
      params.push(device_id);
    }
    if (method) {
      sql += " AND i.method = ?";
      params.push(method);
    }

    sql += " ORDER BY i.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);

    const [rows] = await db.query(sql, params);

    // count total
    let countSql = "SELECT COUNT(*) as total FROM income i WHERE 1=1";
    const countParams = [];
    if (role === "merchant") {
      countSql += " AND i.merchant_id = ?";
      countParams.push(userId);
    } else if (merchant_id) {
      countSql += " AND i.merchant_id = ?";
      countParams.push(merchant_id);
    }
    if (device_id) {
      countSql += " AND i.device_id = ?";
      countParams.push(device_id);
    }
    if (method) {
      countSql += " AND i.method = ?";
      countParams.push(method);
    }

    const [[{ total }]] = await db.query(countSql, countParams);

    res.json({ total, page: Number(page), limit: Number(limit), data: rows });
  } catch (e) {
    console.error("❌ getIncome:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  INCOME: TESTING
// ══════════════════════════════════════════════
exports.getIncomeTesting = async (req, res) => {
  try {
    const { limit = 100, start_date, end_date } = req.query;

    let sql = `SELECT * FROM income_testing`;
    const params = [];
    const where = [];

    if (start_date && end_date) {
      where.push("date_time BETWEEN ? AND ?");
      params.push(start_date, end_date);
    }

    if (where.length > 0) sql += " WHERE " + where.join(" AND ");

    sql += " ORDER BY date_time DESC LIMIT ?";
    params.push(Number(limit));

    const [rows] = await db.query(sql, params);
    res.json({ ok: true, total: rows.length, data: rows });
  } catch (e) {
    console.error("❌ getIncomeTesting:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};
// ══════════════════════════════════════════════
//  INCOME: CATCARWASH
// ══════════════════════════════════════════════
exports.getIncomeCarwash = async (req, res) => {
  try {
    const {
      device_id,
      limit = 50,
      page = 1,
      start_date,
      end_date,
      merchant_id: qMerchantId,
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where = [];
    const params = [];

    if (req.user.role === "admin") {
      if (qMerchantId) {
        where.push("merchant_id = ?");
        params.push(qMerchantId);
      }
    } else if (req.user.role === "merchant") {
      where.push("merchant_id = ?");
      params.push(req.user.id);
    }
    if (device_id) {
      where.push("device_id = ?");
      params.push(device_id);
    }
    if (start_date) {
      where.push("date_time >= ?");
      params.push(start_date);
    }
    if (end_date) {
      where.push("date_time <= ?");
      params.push(end_date + " 23:59:59");
    }

    const whereStr = where.length ? " WHERE " + where.join(" AND ") : "";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM income_catcarwash${whereStr}`,
      params
    );
    const [rows] = await db.query(
      `SELECT * FROM income_catcarwash${whereStr} ORDER BY date_time DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      ok: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: rows,
    });
  } catch (e) {
    console.error("❌ getIncomeCarwash:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ══════════════════════════════════════════════
//  INCOME: CATPAW-SHOE
// ══════════════════════════════════════════════
exports.getIncomeShoe = async (req, res) => {
  try {
    const {
      device_id,
      limit = 50,
      page = 1,
      start_date,
      end_date,
      merchant_id: qMerchantId,
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where = [];
    const params = [];

    if (req.user.role === "admin") {
      if (qMerchantId) {
        where.push("merchant_id = ?");
        params.push(qMerchantId);
      }
    } else if (req.user.role === "merchant") {
      where.push("merchant_id = ?");
      params.push(req.user.id);
    }
    if (device_id) {
      where.push("device_id = ?");
      params.push(device_id);
    }
    if (start_date) {
      where.push("date_time >= ?");
      params.push(start_date);
    }
    if (end_date) {
      where.push("date_time <= ?");
      params.push(end_date + " 23:59:59");
    }

    const whereStr = where.length ? " WHERE " + where.join(" AND ") : "";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM income_catpaw_shoe${whereStr}`,
      params
    );
    const [rows] = await db.query(
      `SELECT * FROM income_catpaw_shoe${whereStr} ORDER BY date_time DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      ok: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: rows,
    });
  } catch (e) {
    console.error("❌ getIncomeShoe:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ══════════════════════════════════════════════
//  INCOME: CATPAW-HELMET
// ══════════════════════════════════════════════
exports.getIncomeHelmet = async (req, res) => {
  try {
    const {
      device_id,
      limit = 50,
      page = 1,
      start_date,
      end_date,
      merchant_id: qMerchantId,
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where = [];
    const params = [];

    if (req.user.role === "admin") {
      if (qMerchantId) {
        where.push("merchant_id = ?");
        params.push(qMerchantId);
      }
    } else if (req.user.role === "merchant") {
      where.push("merchant_id = ?");
      params.push(req.user.id);
    }
    if (device_id) {
      where.push("device_id = ?");
      params.push(device_id);
    }
    if (start_date) {
      where.push("date_time >= ?");
      params.push(start_date);
    }
    if (end_date) {
      where.push("date_time <= ?");
      params.push(end_date + " 23:59:59");
    }

    const whereStr = where.length ? " WHERE " + where.join(" AND ") : "";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM income_catpaw_helmet${whereStr}`,
      params
    );
    const [rows] = await db.query(
      `SELECT * FROM income_catpaw_helmet${whereStr} ORDER BY date_time DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      ok: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: rows,
    });
  } catch (e) {
    console.error("❌ getIncomeHelmet:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ══════════════════════════════════════════════
//  INCOME — รองรับ CATCARWASH / CATPAW-SHOE / CATPAW-HELMET
// ══════════════════════════════════════════════
exports.recordMachineIncome = async (req, res) => {
  try {
    const body = req.body;
    const deviceId = body.deviceId || body.device_id;
    const machineSystem = body.machineSystem || "CATCARWASH";

    if (!deviceId)
      return res.status(400).json({ ok: false, message: "deviceId required" });

    // ── ดึงข้อมูลจาก device_configs + users
    const device = await getDeviceWithMerchant(deviceId);
    console.log("🔍 device:", JSON.stringify(device)); // ← เพิ่มบรรทัดนี้
    if (!device)
      return res
        .status(404)
        .json({ ok: false, message: `Device not found: ${deviceId}` });

    const { device_name, merchant_id, branch_id, line_user_id } = device;
    const dateTime = parseDateTimeStr(body.dateTime);

    console.log("device_name ", device_name);
    console.log("merchant_id ", merchant_id);
    console.log("branch_id ", branch_id);

    if (machineSystem === "CATCARWASH") {
      await db.query(
        `INSERT INTO income_catcarwash
          (device_id,merchant_id,branch_id,machine_system,order_id,
           cash_income,coin_income,qr_income,sum_income,
           wax,tire,vac,air,foam,water,spray,frag,last_money,date_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           cash_income=VALUES(cash_income),coin_income=VALUES(coin_income),
           qr_income=VALUES(qr_income),sum_income=VALUES(sum_income),last_money=VALUES(last_money)`,
        [
          deviceId,
          merchant_id,
          branch_id,
          machineSystem,
          body.orderId || `${deviceId}_${Date.now()}`,
          body.cashIncome ?? 0,
          body.coinIncome ?? 0,
          body.qrIncome ?? 0,
          body.sumIncome ?? 0,
          body.Wax ?? 0,
          body.Tire ?? 0,
          body.Vac ?? 0,
          body.Air ?? 0,
          body.Foam ?? 0,
          body.Water ?? 0,
          body.Spray ?? 0,
          body.Frag ?? 0,
          body.lastMoney ?? 0,
          dateTime,
        ]
      );
    } else if (machineSystem === "CATPAW-SHOE") {
      await db.query(
        `INSERT INTO income_catpaw_shoe
          (device_id,merchant_id,branch_id,machine_system,order_id,
           cash_income,coin_income,qr_income,sum_income,last_money,date_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE cash_income=VALUES(cash_income),sum_income=VALUES(sum_income)`,
        [
          deviceId,
          merchant_id,
          branch_id,
          machineSystem,
          body.orderId || `${deviceId}_${Date.now()}`,
          body.cashIncome ?? 0,
          body.coinIncome ?? 0,
          body.qrIncome ?? 0,
          body.sumIncome ?? 0,
          body.lastMoney ?? 0,
          dateTime,
        ]
      );
    } else if (machineSystem === "CATPAW-HELMET") {
      await db.query(
        `INSERT INTO income_catpaw_helmet
          (device_id,merchant_id,branch_id,machine_system,order_id,
           cash_income,coin_income,qr_income,sum_income,last_money,date_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE cash_income=VALUES(cash_income),sum_income=VALUES(sum_income)`,
        [
          deviceId,
          merchant_id,
          branch_id,
          machineSystem,
          body.orderId || `${deviceId}_${Date.now()}`,
          body.cashIncome ?? 0,
          body.coinIncome ?? 0,
          body.qrIncome ?? 0,
          body.sumIncome ?? 0,
          body.lastMoney ?? 0,
          dateTime,
        ]
      );
    } else {
      return res.status(400).json({
        ok: false,
        message: `Unknown machineSystem: ${machineSystem}`,
      });
    }

    console.log(
      `✅ recordMachineIncome [${machineSystem}] device=${deviceId} merchant=${merchant_id} branch=${branch_id}`
    );

    // ── ส่ง LINE notify (non-blocking)
    if (line_user_id) {
      const method =
        (body.qrIncome ?? 0) > 0
          ? "qr"
          : (body.cashIncome ?? 0) > 0
          ? "cash"
          : (body.coinIncome ?? 0) > 0
          ? "coin"
          : "cash";

      // pushMessage(line_user_id, [
      //   buildIncomeMessage({
      //     deviceName: device_name,
      //     method,
      //     price: body.sumIncome ?? 0,
      //     branchId: branch_id,
      //     createdAt: dateTime,
      //   }),
      // ]);
    }

    res.json({
      ok: true,
      deviceId,
      machineSystem,
      merchant_id,
      branch_id,
      dateTime,
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ ok: false, message: "orderId already exists" });
    console.error("❌ recordMachineIncome:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ══════════════════════════════════════════════
//  INCOME: TESTING
// ══════════════════════════════════════════════
exports.recordTestingIncome = async (req, res) => {
  try {
    const body = req.body;
    const deviceId = body.device_id || body.deviceId;

    if (!deviceId)
      return res.status(400).json({ ok: false, message: "device_id required" });

    // ── ดึงข้อมูลจาก device_configs
    const device = await getDeviceWithMerchant(deviceId);

    if (!device)
      return res
        .status(404)
        .json({ ok: false, message: `Device not found: ${deviceId}` });

    const { merchant_id, branch_id } = device;
    const dateTime = parseDateTimeStr(body.dateTime);

    await db.query(
      `INSERT INTO income_testing
        (device_id,merchant_id,branch_id,
         cash_income,coin_income,sum_income,last_money,date_time,debug_mode)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        deviceId,
        merchant_id,
        branch_id,
        body.cashIncome ?? 0,
        body.coinIncome ?? 0,
        body.sumIncome ?? 0,
        body.lastMoney ?? 0,
        dateTime,
        body.debugMode ? 1 : 0,
      ]
    );

    console.log(
      `✅ recordTestingIncome device=${deviceId} merchant=${merchant_id}`
    );
    res.json({ ok: true, deviceId, merchant_id, branch_id, dateTime });
  } catch (e) {
    console.error("❌ recordTestingIncome:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ══════════════════════════════════════════════
//  GET /api/income/machine
// ══════════════════════════════════════════════
exports.getMachineIncome = async (req, res) => {
  try {
    const { device_id, machine_system = "CATCARWASH", limit = 50 } = req.query;
    const tableMap = {
      CATCARWASH: "income_catcarwash",
      "CATPAW-SHOE": "income_catpaw_shoe",
      "CATPAW-HELMET": "income_catpaw_helmet",
    };
    const table = tableMap[machine_system];
    if (!table)
      return res.status(400).json({
        ok: false,
        message: `Unknown machine_system: ${machine_system}`,
      });

    let sql = `SELECT * FROM \`${table}\``;
    const params = [];
    if (device_id) {
      sql += " WHERE device_id = ?";
      params.push(device_id);
    }
    sql += " ORDER BY date_time DESC LIMIT ?";
    params.push(Number(limit));

    const [rows] = await db.query(sql, params);
    res.json({ ok: true, machine_system, total: rows.length, data: rows });
  } catch (e) {
    console.error("❌ getMachineIncome:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};
