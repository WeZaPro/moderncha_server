// config/appConfig.js

const path = require("path");
// ════════════════════════════════════════════
//  🔧 SWITCH MODE ตรงนี้เพียงที่เดียว
//  "test"  → MQTT: broker.hivemq.com | KSher: sandbox
//  "prod"  → MQTT: 127.0.0.1:9359    | KSher: production
// ════════════════════════════════════════════

const MODE = "prod"; // ← เปลี่ยนแค่บรรทัดนี้
// const MODE = "test"; // ← เปลี่ยนแค่บรรทัดนี้

/* ─── MQTT ─────────────────────────────────── */
const MQTT_CONFIGS = {
  test: {
    url: "mqtt://broker.hivemq.com:1883",
    clientId: `node-test-${require("crypto").randomBytes(4).toString("hex")}`,
    username: undefined,
    password: undefined,
  },
  prod: {
    url: "mqtt://127.0.0.1:9359",
    clientId: "node-backend-01",
    username: "mqttuser",
    password: "ModernCha@5050",
  },
};

/* ─── KSher ─────────────────────────────────── */
// const KSHER_CONFIGS = {
//   test: {
//     appid: process.env.KSHER_APPID_TEST || "mch48816",
//     privatekey:
//       process.env.KSHER_KEY_TEST ||
//       path.resolve(__dirname, "../Mch48816_PrivateKey.pem"), // ✅ absolute path
//     notify_url:
//       process.env.NOTIFY_URL_TEST ||
//       "https://accent-inserted-improved-korean.trycloudflare.com/notify",
//   },
//   prod: {
//     appid: process.env.KSHER_APPID_PROD || "mch48816",
//     privatekey:
//       process.env.KSHER_KEY_PROD ||
//       path.resolve(__dirname, "../Mch48816_PrivateKey.pem"),
//     notify_url:
//       process.env.NOTIFY_URL_PROD ||
//       "https://accent-inserted-improved-korean.trycloudflare.com/notify",
//   },
// };

const mqttConfig = MQTT_CONFIGS[MODE];
// const ksherConfig = KSHER_CONFIGS[MODE];

console.log(`🌐 APP MODE : ${MODE.toUpperCase()}`);
console.log(`🔌 MQTT URL : ${mqttConfig.url}`);
// console.log(`💳 KSher    : ${ksherConfig.notify_url}`);

// module.exports = { MODE, mqttConfig, ksherConfig };
module.exports = { MODE, mqttConfig };
