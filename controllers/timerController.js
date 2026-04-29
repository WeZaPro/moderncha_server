const { client, MQTT_PREFIX } = require("../config/mqtt");

// 🔥 เพิ่ม import logger
const { saveLog } = require("../utils/logger");

function sendTimerMQTT(deviceId, timer) {
  const topic = `${MQTT_PREFIX}/${deviceId}/cmd`;

  const payload = {
    cmd: "set-timer",
    value: timer,
  };

  client.publish(topic, JSON.stringify(payload), { retain: false });

  console.log("⏱ TIMER SENT ->", deviceId, timer);

  // ⭐ SAVE LOG
  saveLog({
    deviceId,
    action: "set-timer",
    value: timer,
    time: new Date().toISOString(),
  });
}

exports.setTimer = (req, res) => {
  const { deviceId, timer } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: "deviceId required" });
  }

  sendTimerMQTT(deviceId, timer);

  res.json({
    ok: true,
    deviceId,
    timer,
  });
};
