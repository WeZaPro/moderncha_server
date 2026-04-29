// config/mqtt.js
const mqtt = require("mqtt");
const { mqttConfig } = require("./appConfig");

const { logMqtt } = require("../utils/mqttLogger");
const db = require("../models/db"); // ✅ NEW

const MQTT_PREFIX = process.env.MQTT_PREFIX || "esp32/dev123";

// ✅ กันยิง update ซ้ำ (ลด DB load)
const lastStatusMap = new Map();

// ── helper แปลง boolean array → "0,1" ──
function boolArrayToStr(arr, def) {
  if (!Array.isArray(arr)) return def;
  return arr.map((v) => (v ? "1" : "0")).join(",");
}

const client = mqtt.connect(mqttConfig.url, {
  clientId: mqttConfig.clientId,
  username: mqttConfig.username,
  password: mqttConfig.password,
  clean: true,
  keepalive: 30,
  reconnectPeriod: 3000,
});

client.on("connect", () =>
  console.log(`✅ MQTT connected → ${mqttConfig.url}`)
);

client.on("message", (topic, buf) => {
  try {
    const payload = JSON.parse(buf.toString());

    // console.log("start status=====> ");
    // console.log("start status topic=====> ", topic);
    // console.log("start status payload= water_level====> ", payload.water_level);

    // logMqtt(topic, payload); // ← เดิม

    // ─────────────────────────────────────────────
    // 🔥 AUTO UPDATE STATUS → DB
    // ─────────────────────────────────────────────

    const deviceId = payload.deviceId;

    if (!deviceId) {
      console.log("⚠️ no deviceId → skip");
      return;
    }

    const updates = {
      water_level: boolArrayToStr(payload.water_level, "0,0,0,0,0,0"),
      sensor: boolArrayToStr(payload.sensor, "0,0"),
      current_state: payload.current_state || "IDLE",
      last_money: payload.min_money ?? 0,
      debug: payload.debug ? 1 : 0,
      // heartbeat_inv: payload.heartbeat_inv ?? 0,
      // start_prices: payload.start_prices ?? 0,
      // pro_mo: parseFloat(payload.pro_mo) || 0.0,
      lastedUpdate: new Date().toISOString().slice(0, 19).replace("T", " "),
    };

    // ✅ กันยิงซ้ำ
    const cacheKey = JSON.stringify(updates);
    if (lastStatusMap.get(deviceId) === cacheKey) {
      console.log("⏭ skip duplicate");
      return;
    }
    lastStatusMap.set(deviceId, cacheKey);

    const fields = Object.keys(updates)
      .map((k) => `\`${k}\` = ?`)
      .join(", ");

    const values = [...Object.values(updates), deviceId];

    // console.log("🧠 updating DB:", deviceId);

    db.query(`UPDATE device_configs SET ${fields} WHERE device_id = ?`, values)
      .then(([result]) => {
        // console.log("🧾 result:", result);

        if (result.affectedRows > 0) {
          console.log(`✅ UPDATED → ${deviceId}`);
        } else {
          console.log(`⚠️ NOT FOUND → ${deviceId}`);
        }
      })
      .catch((err) => {
        console.error("❌ DB ERROR:", err.message);
      });
    // ─────────────────────────────────────────────
  } catch {
    /* non-JSON */
  }
});

client.on("reconnect", () => console.log("🔄 MQTT reconnecting..."));

client.on("error", (e) => console.log("❌ MQTT error:", e.message));

module.exports = { client, MQTT_PREFIX };
