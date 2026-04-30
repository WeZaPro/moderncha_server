// controllers/deviceController.js
const { client, MQTT_PREFIX } = require("../config/mqtt");
const db = require("../models/db");
const crypto = require("crypto");

const MERCHANT_ALLOWED_CMDS = ["set-db-config", "send-config-from-db"];

// ══════════════════════════════════════════════
//  MQTT COMMANDS
// ══════════════════════════════════════════════
exports.sendDevice = (req, res) => {
  const { deviceId, payload } = req.body;
  if (!deviceId || !payload || !payload.cmd) {
    return res
      .status(400)
      .json({ message: "deviceId and payload.cmd required" });
  }
  if (req.user && req.user.role === "merchant") {
    if (!MERCHANT_ALLOWED_CMDS.includes(payload.cmd)) {
      return res.status(403).json({
        message: `Merchant cannot send cmd: ${payload.cmd}`,
        allowed: MERCHANT_ALLOWED_CMDS,
      });
    }
  }
  const topic = `${MQTT_PREFIX}/${deviceId}/cmd`;
  client.publish(topic, JSON.stringify(payload));
  const who = req.user ? `[${req.user.role}] ${req.user.email}` : "[no-auth]";
  console.log(`📤 ${who} → ${topic} cmd=${payload.cmd}`);
  res.json({ ok: true, topic, cmd: payload.cmd });
};

exports.broadcast = (io) => (req, res) => {
  io.emit("device-cmd", [{ msg: req.body.msg }]);
  res.json({ ok: true });
};

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function parseFnTime(val) {
  if (!val || val === "none") return [];
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

function parseFnEnable(val) {
  if (!val || val === "none") return [1, 1, 1, 1, 1, 1, 1, 1];
  try {
    return JSON.parse(val);
  } catch {
    return [1, 1, 1, 1, 1, 1, 1, 1];
  }
}

function parseCommaOrJson(val, defaultVal) {
  if (val === undefined || val === null || val === "none") return defaultVal;
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    /* not JSON */
  }
  return val.split(",").map((v) => v.trim());
}

function serializeArray(val) {
  if (Array.isArray(val)) return val.join(",");
  return String(val);
}

function parseDateTH(str) {
  if (!str || str === "none" || str === null) return null;
  const dtMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (dtMatch) return `${dtMatch[3]}-${dtMatch[2]}-${dtMatch[1]} ${dtMatch[4]}`;
  const dMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dMatch) return `${dMatch[3]}-${dMatch[2]}-${dMatch[1]}`;
  const mysqlDt = str.match(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/);
  if (mysqlDt) return str.slice(0, 19).replace("T", " ");
  const mysqlD = str.match(/^\d{4}-\d{2}-\d{2}$/);
  if (mysqlD) return str;
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().slice(0, 19).replace("T", " ");
  return null;
}

// ── แปลง datetime string → MySQL DATETIME ──
function parseDateTimeStr(str) {
  if (!str) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().slice(0, 19).replace("T", " ");
  return str;
}

// ── ดึง merchant_id + branch_id จาก device_configs ──
async function getDeviceMeta(deviceId, fallbackMerchant, fallbackBranch) {
  try {
    const [rows] = await db.query(
      "SELECT merchant_id, branch_id FROM device_configs WHERE device_id = ?",
      [deviceId]
    );
    return {
      merchant_id: rows[0]?.merchant_id || fallbackMerchant || null,
      branch_id: rows[0]?.branch_id || fallbackBranch || null,
    };
  } catch {
    return {
      merchant_id: fallbackMerchant || null,
      branch_id: fallbackBranch || null,
    };
  }
}

function parseDeviceRow(r) {
  return {
    ...r,
    fn_time: parseFnTime(r.fn_time),
    fn_enable: parseFnEnable(r.fn_enable),
    fnOrder: parseCommaOrJson(r.fnOrder, [0, 1, 2, 3, 4, 5, 6, 7]).map(Number),
    delay_time: parseCommaOrJson(r.delay_time, [0, 0, 0, 0, 0, 0, 0, 0]).map(
      Number
    ),
    water_level: parseCommaOrJson(r.water_level, [
      false,
      false,
      false,
      false,
      false,
      false,
    ]).map((v) => v === "1" || v === true || v === "true"),
    sensor: parseCommaOrJson(r.sensor, [false, false]).map(
      (v) => v === "1" || v === true || v === "true"
    ),
  };
}

// ══════════════════════════════════════════════
//  CRUD: device_configs
// ══════════════════════════════════════════════

exports.getAllDeviceConfigs = async (req, res) => {
  try {
    let sql = "SELECT * FROM device_configs";
    let params = [];
    if (req.user.role === "merchant") {
      sql += " WHERE merchant_id = ?";
      params.push(String(req.user.id));
    }
    sql += " ORDER BY created_at DESC";
    const [rows] = await db.query(sql, params);
    res.json(rows.map(parseDeviceRow));
  } catch (e) {
    console.error("❌ getAllDeviceConfigs:", e.message);
    res.status(500).json({ message: e.message });
  }
};

exports.getDeviceConfig = async (req, res) => {
  try {
    const { device_id } = req.params;
    let sql = "SELECT * FROM device_configs WHERE device_id = ?";
    let params = [device_id];
    if (req.user.role === "merchant") {
      sql += " AND merchant_id = ?";
      params.push(String(req.user.id));
    }
    const [rows] = await db.query(sql, params);
    if (!rows.length)
      return res.status(404).json({ message: "Device config not found" });
    res.json(parseDeviceRow(rows[0]));
  } catch (e) {
    console.error("❌ getDeviceConfig:", e.message);
    res.status(500).json({ message: e.message });
  }
};

exports.createDeviceConfig = async (req, res) => {
  try {
    const merchantId =
      req.user.role === "admin"
        ? req.body.merchant_id || String(req.user.id)
        : String(req.user.id);

    const {
      branch_id,
      device_id,
      name,
      lat,
      lon,
      mac,
      chip,
      flash,
      ota_size,
      hw,
      ver,
      update_date,
      ssid,
      wfpwd,
      fn_time,
      fn_enable,
      machine_active,
      multi_mode,
      heartbeat_inv,
      bank_accept,
      coin_accept,
      qr_accept,
      start_prices,
      last_money,
      pro_mo,
      virtual_money,
      start_timeout,
      money_mem_active,
      bill_type,
      scr_rotate,
      prices_list,
      reset_reason,
      date_time,
      debug,
      HMI,
      machine_system,
      fnOrder,
      lastedUpdate,
      lastedMaintenance,
      current_state,
      delay_time,
      water_level,
      sensor,
    } = req.body;

    if (!device_id)
      return res.status(400).json({ message: "device_id required" });

    const finalBranchId =
      branch_id || "br-" + crypto.randomBytes(4).toString("hex").toUpperCase();

    const [projRows] = await db.query(
      "SELECT id FROM projects WHERE branch_id = ? AND merchant_id = ?",
      [finalBranchId, merchantId]
    );
    if (!projRows.length) {
      await db.query(
        "INSERT INTO projects (merchant_id, branch_id, project_name) VALUES (?, ?, ?)",
        [merchantId, finalBranchId, name || device_id]
      );
    }

    const fnTimeStr = Array.isArray(fn_time)
      ? JSON.stringify(fn_time)
      : fn_time || "none";
    const fnEnableStr = Array.isArray(fn_enable)
      ? JSON.stringify(fn_enable)
      : fn_enable || "none";
    const fnOrderStr = fnOrder ? serializeArray(fnOrder) : "0,1,2,3,4,5,6,7";
    const delayTimeStr = delay_time
      ? serializeArray(delay_time)
      : "0,0,0,0,0,0,0,0";
    const waterLevelStr = water_level
      ? serializeArray(
          Array.isArray(water_level)
            ? water_level.map((v) => (v ? "1" : "0"))
            : String(water_level)
                .split(",")
                .map((v) =>
                  v.trim() === "true" || v.trim() === "1" ? "1" : "0"
                )
        )
      : "0,0,0,0,0,0";
    const sensorStr = sensor
      ? serializeArray(
          Array.isArray(sensor)
            ? sensor.map((v) => (v ? "1" : "0"))
            : String(sensor)
                .split(",")
                .map((v) =>
                  v.trim() === "true" || v.trim() === "1" ? "1" : "0"
                )
        )
      : "0,0";

    const lastedUpdateMysql = parseDateTH(lastedUpdate);
    const lastedMaintenanceMysql = parseDateTH(lastedMaintenance);

    const values = [
      merchantId,
      finalBranchId,
      device_id,
      name || "none",
      lat || 0,
      lon || 0,
      mac || 0,
      chip || 0,
      flash || "none",
      ota_size || "none",
      hw || "none",
      ver || "none",
      update_date || "none",
      ssid || "none",
      wfpwd || "none",
      fnTimeStr,
      fnEnableStr,
      machine_active ?? 1,
      multi_mode ?? 1,
      heartbeat_inv || 0,
      bank_accept ?? 1,
      coin_accept ?? 1,
      qr_accept ?? 1,
      start_prices || 0,
      last_money || 0,
      pro_mo !== undefined && pro_mo !== null ? parseFloat(pro_mo) : 1.0,
      virtual_money || 0,
      start_timeout || 0,
      money_mem_active ?? 1,
      bill_type || "none",
      scr_rotate || 0,
      prices_list || null,
      reset_reason || "none",
      date_time || "none",
      debug ?? 1,
      HMI || "HDMI",
      machine_system || "CATCARWASH",
      fnOrderStr,
      lastedUpdateMysql,
      lastedMaintenanceMysql,
      current_state || "IDLE",
      delayTimeStr,
      waterLevelStr,
      sensorStr,
    ];

    const sql = `
      INSERT INTO device_configs (
        merchant_id, branch_id, device_id, name,
        lat, lon, mac, chip, flash, ota_size, hw,
        ver, update_date, ssid, wfpwd,
        fn_time, fn_enable,
        machine_active, multi_mode, heartbeat_inv,
        bank_accept, coin_accept, qr_accept,
        start_prices, last_money, pro_mo, virtual_money,
        start_timeout, money_mem_active, bill_type,
        scr_rotate, prices_list, reset_reason, date_time, debug,
        HMI, machine_system, fnOrder,
        lastedUpdate, lastedMaintenance,
        current_state, delay_time, water_level, sensor
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const qCount = (sql.match(/\?/g) || []).length;
    if (qCount !== values.length) {
      return res.status(500).json({
        message: `SQL placeholder mismatch: ${qCount} vs ${values.length}`,
      });
    }

    const [result] = await db.query(sql, values);
    res.json({
      ok: true,
      id: result.insertId,
      device_id,
      merchant_id: merchantId,
      branch_id: finalBranchId,
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "device_id already exists" });
    console.error("❌ createDeviceConfig:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// exports.updateDeviceConfig = async (req, res) => {
//   try {
//     const { device_id } = req.params;
//     let checkSql = "SELECT id FROM device_configs WHERE device_id = ?";
//     let checkParams = [device_id];
//     if (req.user.role === "merchant") {
//       checkSql += " AND merchant_id = ?";
//       checkParams.push(String(req.user.id));
//     }
//     const [rows] = await db.query(checkSql, checkParams);
//     if (!rows.length)
//       return res.status(404).json({ message: "Device config not found" });

//     if (req.body.fn_time !== undefined)
//       req.body.fn_time = Array.isArray(req.body.fn_time)
//         ? JSON.stringify(req.body.fn_time)
//         : req.body.fn_time;
//     if (req.body.fn_enable !== undefined)
//       req.body.fn_enable = Array.isArray(req.body.fn_enable)
//         ? JSON.stringify(req.body.fn_enable)
//         : req.body.fn_enable;
//     if (req.body.pro_mo !== undefined)
//       req.body.pro_mo = parseFloat(req.body.pro_mo) || 0.0;
//     if (req.body.fnOrder !== undefined)
//       req.body.fnOrder = serializeArray(req.body.fnOrder);
//     if (req.body.delay_time !== undefined)
//       req.body.delay_time = serializeArray(req.body.delay_time);
//     if (req.body.water_level !== undefined) {
//       const arr = Array.isArray(req.body.water_level)
//         ? req.body.water_level
//         : String(req.body.water_level).split(",");
//       req.body.water_level = arr
//         .map((v) => (v === true || v === "true" || v === "1" ? "1" : "0"))
//         .join(",");
//     }
//     if (req.body.sensor !== undefined) {
//       const arr = Array.isArray(req.body.sensor)
//         ? req.body.sensor
//         : String(req.body.sensor).split(",");
//       req.body.sensor = arr
//         .map((v) => (v === true || v === "true" || v === "1" ? "1" : "0"))
//         .join(",");
//     }
//     if (req.body.lastedUpdate !== undefined)
//       req.body.lastedUpdate = parseDateTH(req.body.lastedUpdate);
//     if (req.body.lastedMaintenance !== undefined)
//       req.body.lastedMaintenance = parseDateTH(req.body.lastedMaintenance);

//     const allowed = [
//       "name",
//       "lat",
//       "lon",
//       "mac",
//       "chip",
//       "flash",
//       "ota_size",
//       "hw",
//       "ver",
//       "update_date",
//       "ssid",
//       "wfpwd",
//       "fn_time",
//       "fn_enable",
//       "machine_active",
//       "multi_mode",
//       "heartbeat_inv",
//       "bank_accept",
//       "coin_accept",
//       "qr_accept",
//       "start_prices",
//       "last_money",
//       "pro_mo",
//       "virtual_money",
//       "start_timeout",
//       "money_mem_active",
//       "bill_type",
//       "scr_rotate",
//       "prices_list",
//       "reset_reason",
//       "date_time",
//       "debug",
//       "HMI",
//       "machine_system",
//       "fnOrder",
//       "lastedUpdate",
//       "lastedMaintenance",
//       "current_state",
//       "delay_time",
//       "water_level",
//       "sensor",
//       // ✅ เพิ่ม catpaw fields
//       "t_total",
//       "bact_s",
//       "bact_e",
//       "ozone_s",
//       "ozone_e",
//       "perfume_s",
//       "perfume_e",
//       "dust_s",
//       "dust_e",
//       "uv_s",
//       "uv_e",
//       "dry_s",
//       "dry_e",
//     ];

//     const fields = [];
//     const values = [];
//     for (const key of allowed) {
//       if (req.body[key] !== undefined) {
//         fields.push(`\`${key}\` = ?`);
//         values.push(req.body[key]);
//       }
//     }
//     if (!fields.length)
//       return res.status(400).json({ message: "No valid fields to update" });

//     values.push(device_id);
//     await db.query(
//       `UPDATE device_configs SET ${fields.join(", ")} WHERE device_id = ?`,
//       values
//     );
//     res.json({ ok: true, device_id, updated: fields.length });
//   } catch (e) {
//     console.error("❌ updateDeviceConfig:", e.message);
//     res.status(500).json({ message: e.message });
//   }
// };

exports.updateDeviceConfig = async (req, res) => {
  try {
    const { device_id } = req.params;
    let checkSql = "SELECT id FROM device_configs WHERE device_id = ?";
    let checkParams = [device_id];
    if (req.user.role === "merchant") {
      checkSql += " AND merchant_id = ?";
      checkParams.push(String(req.user.id));
    }
    const [rows] = await db.query(checkSql, checkParams);
    if (!rows.length)
      return res.status(404).json({ message: "Device config not found" });

    if (req.body.fn_time !== undefined)
      req.body.fn_time = Array.isArray(req.body.fn_time)
        ? JSON.stringify(req.body.fn_time)
        : req.body.fn_time;
    if (req.body.fn_enable !== undefined)
      req.body.fn_enable = Array.isArray(req.body.fn_enable)
        ? JSON.stringify(req.body.fn_enable)
        : req.body.fn_enable;
    if (req.body.pro_mo !== undefined)
      req.body.pro_mo = parseFloat(req.body.pro_mo) || 0.0;
    if (req.body.fnOrder !== undefined)
      req.body.fnOrder = serializeArray(req.body.fnOrder);
    if (req.body.delay_time !== undefined)
      req.body.delay_time = serializeArray(req.body.delay_time);

    if (req.body.lastedUpdate !== undefined)
      req.body.lastedUpdate = parseDateTH(req.body.lastedUpdate);
    if (req.body.lastedMaintenance !== undefined)
      req.body.lastedMaintenance = parseDateTH(req.body.lastedMaintenance);

    const allowed = [
      "name",
      "lat",
      "lon",
      "mac",
      "chip",
      "flash",
      "ota_size",
      "hw",
      "ver",
      "update_date",
      "ssid",
      "wfpwd",
      "fn_time",
      "fn_enable",
      "machine_active",
      "multi_mode",
      "heartbeat_inv",
      "bank_accept",
      "coin_accept",
      "qr_accept",
      "start_prices",
      "last_money",
      "pro_mo",
      "virtual_money",
      "start_timeout",
      "money_mem_active",
      "bill_type",
      "scr_rotate",
      "prices_list",
      "reset_reason",
      "date_time",
      "debug",
      "HMI",
      "machine_system",
      "fnOrder",
      "lastedUpdate",
      "lastedMaintenance",
      "current_state",
      "delay_time",
      // "water_level",
      // "sensor",
      // ✅ เพิ่ม catpaw fields
      "t_total",
      "bact_s",
      "bact_e",
      "ozone_s",
      "ozone_e",
      "perfume_s",
      "perfume_e",
      "dust_s",
      "dust_e",
      "uv_s",
      "uv_e",
      "dry_s",
      "dry_e",
    ];

    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`\`${key}\` = ?`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length)
      return res.status(400).json({ message: "No valid fields to update" });

    values.push(device_id);
    await db.query(
      `UPDATE device_configs SET ${fields.join(", ")} WHERE device_id = ?`,
      values
    );
    res.json({ ok: true, device_id, updated: fields.length });
  } catch (e) {
    console.error("❌ updateDeviceConfig:", e.message);
    res.status(500).json({ message: e.message });
  }
};

exports.deleteDeviceConfig = async (req, res) => {
  try {
    const { device_id } = req.params;
    let checkSql = "SELECT id FROM device_configs WHERE device_id = ?";
    let checkParams = [device_id];
    if (req.user.role === "merchant") {
      checkSql += " AND merchant_id = ?";
      checkParams.push(String(req.user.id));
    }
    const [rows] = await db.query(checkSql, checkParams);
    if (!rows.length)
      return res.status(404).json({ message: "Device config not found" });
    await db.query("DELETE FROM device_configs WHERE device_id = ?", [
      device_id,
    ]);
    res.json({ ok: true, device_id });
  } catch (e) {
    console.error("❌ deleteDeviceConfig:", e.message);
    res.status(500).json({ message: e.message });
  }
};

exports.updateDeviceState = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { current_state, water_level, sensor } = req.body;
    const VALID_STATES = ["IDLE", "PAYMENT", "READY", "OPERATION", "FINISH"];
    const updates = {};

    if (current_state !== undefined) {
      if (!VALID_STATES.includes(current_state))
        return res
          .status(400)
          .json({ message: `Invalid current_state: ${current_state}` });
      updates.current_state = current_state;
    }
    if (water_level !== undefined) {
      const arr = Array.isArray(water_level)
        ? water_level
        : String(water_level).split(",");
      updates.water_level = arr
        .map((v) => (v === true || v === "true" || v === "1" ? "1" : "0"))
        .join(",");
    }
    if (sensor !== undefined) {
      const arr = Array.isArray(sensor) ? sensor : String(sensor).split(",");
      updates.sensor = arr
        .map((v) => (v === true || v === "true" || v === "1" ? "1" : "0"))
        .join(",");
    }
    if (!Object.keys(updates).length)
      return res.status(400).json({
        message: "No valid fields: current_state, water_level, sensor",
      });

    updates.lastedUpdate = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    const setClause = Object.keys(updates)
      .map((k) => `\`${k}\` = ?`)
      .join(", ");
    await db.query(
      `UPDATE device_configs SET ${setClause} WHERE device_id = ?`,
      [...Object.values(updates), device_id]
    );
    res.json({ ok: true, device_id, ...updates });
  } catch (e) {
    console.error("❌ updateDeviceState:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  updateRuntimeFromDevice
//  POST /api/device-configs/runtime (no auth)
// ══════════════════════════════════════════════
exports.updateRuntimeFromDevice = async (req, res) => {
  try {
    const body = req.body;
    const device_id = body.deviceId || body.device_id;
    if (!device_id)
      return res.status(400).json({ ok: false, message: "deviceId required" });

    const VALID_STATES = ["IDLE", "PAYMENT", "READY", "OPERATION", "FINISH"];
    const updates = {};

    if (body.current_state !== undefined) {
      if (!VALID_STATES.includes(body.current_state))
        return res.status(400).json({
          ok: false,
          message: `Invalid current_state: ${body.current_state}`,
        });
      updates.current_state = body.current_state;
    }
    if (body.water_level !== undefined) {
      const arr = Array.isArray(body.water_level)
        ? body.water_level
        : String(body.water_level).split(",");
      updates.water_level = arr
        .map((v) =>
          v === true || v === "true" || v === 1 || v === "1" ? "1" : "0"
        )
        .join(",");
    }
    if (body.sensor !== undefined) {
      const arr = Array.isArray(body.sensor)
        ? body.sensor
        : String(body.sensor).split(",");
      updates.sensor = arr
        .map((v) =>
          v === true || v === "true" || v === 1 || v === "1" ? "1" : "0"
        )
        .join(",");
    }
    if (body.lastMoney !== undefined && body.lastMoney !== null) {
      const val = parseFloat(body.lastMoney);
      if (isNaN(val))
        return res
          .status(400)
          .json({ ok: false, message: "lastMoney must be a number" });
      updates.last_money = val;
    }
    if (body.debug !== undefined) updates.debug = body.debug ? 1 : 0;

    if (!Object.keys(updates).length)
      return res
        .status(400)
        .json({ ok: false, message: "No valid fields provided" });

    updates.lastedUpdate = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const setClause = Object.keys(updates)
      .map((k) => `\`${k}\` = ?`)
      .join(", ");
    const [result] = await db.query(
      `UPDATE device_configs SET ${setClause} WHERE device_id = ?`,
      [...Object.values(updates), device_id]
    );
    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ ok: false, message: `device_id not found: ${device_id}` });

    console.log(
      `✅ runtimeUpdate [HTTP]: ${device_id} fields=[${Object.keys(
        updates
      ).join(",")}]`
    );
    res.json({ ok: true, device_id, updated: Object.keys(updates) });
  } catch (e) {
    console.error("❌ updateRuntimeFromDevice:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ══════════════════════════════════════════════
//  buildMqttPayload
// ══════════════════════════════════════════════
function buildMqttPayload(cfg) {
  let fnTimeArr = [];
  try {
    fnTimeArr =
      cfg.fn_time && cfg.fn_time !== "none" ? JSON.parse(cfg.fn_time) : [];
  } catch {
    fnTimeArr = [];
  }
  const rates = fnTimeArr.slice(0, 8);
  const fnTimeout = fnTimeArr[8] ?? null;
  const startTimeout = fnTimeout ?? cfg.start_timeout ?? 1200;
  const fnEnableArr = parseFnEnable(cfg.fn_enable);
  const fnOrderArr = parseCommaOrJson(
    cfg.fnOrder,
    [0, 1, 2, 3, 4, 5, 6, 7]
  ).map(Number);
  const delayTimeArr = parseCommaOrJson(
    cfg.delay_time,
    [0, 0, 0, 0, 0, 0, 0, 0]
  ).map(Number);
  const waterLevelArr = parseCommaOrJson(cfg.water_level, [
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ]).map((v) => v === "1" || v === true || v === "true");
  const sensorArr = parseCommaOrJson(cfg.sensor, ["0", "0"]).map(
    (v) => v === "1" || v === true || v === "true"
  );
  return {
    cmd: "set-db-config",
    branch_id: cfg.branch_id || "",
    name: cfg.name || "",
    lat: cfg.lat || 0,
    lon: cfg.lon || 0,
    ssid: cfg.ssid || "",
    wfpwd: cfg.wfpwd || "",
    ver: cfg.ver || "",
    bill_type: cfg.bill_type || "",
    heartbeat_inv: cfg.heartbeat_inv ?? 10,
    start_prices: cfg.start_prices ?? 30,
    start_timeout: startTimeout,
    machine_active: cfg.machine_active ?? true,
    multi_mode: cfg.multi_mode ?? false,
    bank_accept: cfg.bank_accept ?? true,
    coin_accept: cfg.coin_accept ?? true,
    qr_accept: cfg.qr_accept ?? true,
    money_mem_active: cfg.money_mem_active ?? true,
    debug: cfg.debug ?? false,
    fn_time: rates,
    fn_enable: fnEnableArr,
    pro_mo: parseFloat(cfg.pro_mo) || 0.0,
    HMI: cfg.HMI || "HDMI",
    machine_system: cfg.machine_system || "CATCARWASH",
    fnOrder: fnOrderArr,
    lastedUpdate: cfg.lastedUpdate || null,
    lastedMaintenance: cfg.lastedMaintenance || null,
    current_state: cfg.current_state || "IDLE",
    delay_time: delayTimeArr,
    water_level: waterLevelArr,
    sensor: sensorArr,
  };
}

exports.sendConfigFromDB = async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId)
      return res.status(400).json({ message: "deviceId required" });
    const [rows] = await db.query(
      "SELECT * FROM device_configs WHERE device_id = ?",
      [deviceId]
    );
    if (!rows.length)
      return res.status(404).json({ message: "Device config not found" });
    const payload = buildMqttPayload(rows[0]);
    const topic = `${MQTT_PREFIX}/${deviceId}/cmd`;
    client.publish(topic, JSON.stringify(payload));
    console.log(`📤 [${req.user?.role}] sendConfigFromDB → ${topic}`);
    res.json({ ok: true, topic, payload });
  } catch (e) {
    console.error("❌ sendConfigFromDB:", e.message);
    res.status(500).json({ message: e.message });
  }
};

exports.sendConfigToGroup = async (req, res) => {
  try {
    const { branch_id, merchant_id } = req.body;
    const callerMerchantId = req.user.id;
    const callerRole = req.user.role;
    if (!branch_id && !merchant_id)
      return res
        .status(400)
        .json({ message: "branch_id or merchant_id required" });

    let sql = "SELECT * FROM device_configs WHERE 1=1";
    let params = [];
    if (branch_id) {
      sql += " AND branch_id = ?";
      params.push(branch_id);
    }
    if (merchant_id) {
      const target =
        callerRole === "admin" ? String(merchant_id) : String(callerMerchantId);
      sql += " AND merchant_id = ?";
      params.push(target);
    } else if (callerRole === "merchant") {
      sql += " AND merchant_id = ?";
      params.push(String(callerMerchantId));
    }

    const [rows] = await db.query(sql, params);
    if (!rows.length)
      return res.status(404).json({ message: "No devices found" });

    const results = [];
    for (const cfg of rows) {
      try {
        const payload = buildMqttPayload(cfg);
        const topic = `${MQTT_PREFIX}/${cfg.device_id}/cmd`;
        client.publish(topic, JSON.stringify(payload));
        results.push({
          device_id: cfg.device_id,
          branch_id: cfg.branch_id,
          ok: true,
          topic,
        });
      } catch (err) {
        results.push({
          device_id: cfg.device_id,
          ok: false,
          error: err.message,
        });
      }
    }
    res.json({
      ok: true,
      total: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    console.error("❌ sendConfigToGroup:", e.message);
    res.status(500).json({ message: e.message });
  }
};

// ══════════════════════════════════════════════
//  syncConfigFromDevice — no auth
// ══════════════════════════════════════════════
exports.syncConfigFromDevice = async (req, res) => {
  try {
    const body = req.body;
    const device_id = body.device_id;
    if (!device_id)
      return res.status(400).json({ ok: false, message: "device_id required" });

    const [devRows] = await db.query(
      "SELECT merchant_id, branch_id, name FROM devices WHERE device_id = ?",
      [device_id]
    );
    const merchantId = devRows[0]?.merchant_id || null;
    const branchId = devRows[0]?.branch_id || body.branch_id || null;
    const deviceName = body.name || devRows[0]?.name || device_id;

    const fnTimeStr = Array.isArray(body.fn_time)
      ? JSON.stringify(body.fn_time)
      : "none";
    const fnEnableStr = Array.isArray(body.fn_enable)
      ? JSON.stringify(body.fn_enable)
      : "none";
    const fnOrderStr = Array.isArray(body.fnOrder)
      ? body.fnOrder.join(",")
      : "0,1,2,3,4,5,6,7";
    const delayStr = Array.isArray(body.delay_time)
      ? body.delay_time.join(",")
      : "0,0,0,0,0,0,0,0";
    const wlStr = Array.isArray(body.water_level)
      ? body.water_level.map((v) => (v ? "1" : "0")).join(",")
      : "0,0,0,0,0,0";
    const snStr = Array.isArray(body.sensor)
      ? body.sensor.map((v) => (v ? "1" : "0")).join(",")
      : "0,0";

    const [existing] = await db.query(
      "SELECT id FROM device_configs WHERE device_id = ?",
      [device_id]
    );

    if (existing.length) {
      await db.query(
        `UPDATE device_configs SET
          merchant_id=COALESCE(?,merchant_id), branch_id=COALESCE(?,branch_id), name=?,
          ssid=?, wfpwd=?, ver=?, bill_type=?,
          heartbeat_inv=?, start_prices=?, start_timeout=?,
          machine_active=?, multi_mode=?, bank_accept=?, coin_accept=?, qr_accept=?,
          money_mem_active=?, debug=?, pro_mo=?,
          HMI=?, machine_system=?, current_state=?,
          fn_time=?, fn_enable=?, fnOrder=?, delay_time=?, water_level=?, sensor=?,
          lastedUpdate=NOW()
        WHERE device_id=?`,
        [
          merchantId,
          branchId,
          deviceName,
          body.ssid || "",
          body.wfpwd || "",
          body.ver || "",
          body.bill_type || "",
          body.heartbeat_inv ?? 10,
          body.start_prices ?? 30,
          body.start_timeout ?? 1200,
          body.machine_active ? 1 : 0,
          body.multi_mode ? 1 : 0,
          body.bank_accept ? 1 : 0,
          body.coin_accept ? 1 : 0,
          body.qr_accept ? 1 : 0,
          body.money_mem_active ? 1 : 0,
          body.debug ? 1 : 0,
          parseFloat(body.pro_mo) || 0.0,
          body.HMI || "HDMI",
          body.machine_system || "CATCARWASH",
          body.current_state || "IDLE",
          fnTimeStr,
          fnEnableStr,
          fnOrderStr,
          delayStr,
          wlStr,
          snStr,
          device_id,
        ]
      );
    } else {
      const finalBranchId =
        branchId || "br-" + crypto.randomBytes(4).toString("hex").toUpperCase();
      await db.query(
        `INSERT INTO device_configs (
          device_id, merchant_id, branch_id, name, ssid, wfpwd, ver, bill_type,
          heartbeat_inv, start_prices, start_timeout,
          machine_active, multi_mode, bank_accept, coin_accept, qr_accept,
          money_mem_active, debug, pro_mo, HMI, machine_system, current_state,
          fn_time, fn_enable, fnOrder, delay_time, water_level, sensor, lastedUpdate
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [
          device_id,
          merchantId,
          finalBranchId,
          deviceName,
          body.ssid || "",
          body.wfpwd || "",
          body.ver || "",
          body.bill_type || "",
          body.heartbeat_inv ?? 10,
          body.start_prices ?? 30,
          body.start_timeout ?? 1200,
          body.machine_active ? 1 : 0,
          body.multi_mode ? 1 : 0,
          body.bank_accept ? 1 : 0,
          body.coin_accept ? 1 : 0,
          body.qr_accept ? 1 : 0,
          body.money_mem_active ? 1 : 0,
          body.debug ? 1 : 0,
          parseFloat(body.pro_mo) || 0.0,
          body.HMI || "HDMI",
          body.machine_system || "CATCARWASH",
          body.current_state || "IDLE",
          fnTimeStr,
          fnEnableStr,
          fnOrderStr,
          delayStr,
          wlStr,
          snStr,
        ]
      );
    }
    res.json({
      ok: true,
      device_id,
      merchant_id: merchantId,
      branch_id: branchId,
    });
  } catch (e) {
    console.error("❌ syncConfigFromDevice:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.getMapData = async (req, res) => {
  try {
    const { merchant_id, months = 1 } = req.query;
    const role = req.user.role;
    const userId = req.user.id;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - Number(months));
    const cutoffStr = cutoff.toISOString().slice(0, 19).replace("T", " ");

    let sql = `
      SELECT dc.device_id, dc.name, dc.branch_id, dc.lat, dc.lon,
             dc.HMI, dc.machine_system, dc.current_state,
             d.status, d.last_seen, d.merchant_id,
             u.name AS merchant_name,
             COALESCE(SUM(i.price), 0) AS total_income,
             COUNT(i.id) AS total_orders
      FROM device_configs dc
      LEFT JOIN devices d ON d.device_id = dc.device_id
      LEFT JOIN users u ON u.id = d.merchant_id
      LEFT JOIN income i ON i.device_id = dc.device_id AND i.created_at >= ?
      WHERE dc.lat != 0 AND dc.lon != 0
    `;
    const params = [cutoffStr];
    if (role === "merchant") {
      sql += " AND d.merchant_id = ?";
      params.push(userId);
    } else if (merchant_id) {
      sql += " AND d.merchant_id = ?";
      params.push(merchant_id);
    }
    sql += " GROUP BY dc.device_id ORDER BY dc.name";

    const [rows] = await db.query(sql, params);
    res.json({ ok: true, data: rows, months: Number(months) });
  } catch (e) {
    console.error("❌ getMapData:", e.message);
    res.status(500).json({ message: e.message });
  }
};

exports.updateStatusFromDevice = async (req, res) => {
  try {
    const body = req.body;
    const deviceId = body.deviceId;
    if (!deviceId)
      return res.status(400).json({ ok: false, message: "deviceId required" });

    const boolArrayToStr = (arr, def) => {
      if (!Array.isArray(arr)) return def;
      return arr.map((v) => (v ? "1" : "0")).join(",");
    };

    const updates = {
      water_level: boolArrayToStr(body.water_level, "0,0,0,0,0,0"),
      sensor: boolArrayToStr(body.sensor, "0,0"),
      current_state: body.current_state || "IDLE",
      last_money: body.min_money ?? 0,
      debug: body.debug ? 1 : 0,
      heartbeat_inv: body.heartbeat_inv ?? 0,
      start_prices: body.start_prices ?? 0,
      pro_mo: parseFloat(body.pro_mo) || 0.0,
      lastedUpdate: new Date().toISOString().slice(0, 19).replace("T", " "),
    };

    const fields = Object.keys(updates)
      .map((k) => `\`${k}\` = ?`)
      .join(", ");
    const [result] = await db.query(
      `UPDATE device_configs SET ${fields} WHERE device_id = ?`,
      [...Object.values(updates), deviceId]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ ok: false, message: "device not found" });

    res.json({ ok: true, deviceId, updated: updates });
  } catch (e) {
    console.error("❌ updateStatusFromDevice:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
};
