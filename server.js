// server.js
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

// ✅ โหลด config ก่อนทุกอย่าง (จะ print mode ออกมา)
require("./config/appConfig");

const initSocket = require("./config/socket");
const { client, MQTT_PREFIX } = require("./config/mqtt");
const initMQTT = require("./config/mqttHandler");
const { loadDeviceFile, loadGroup } = require("./utils/helper");

/* ═══ Routes เดิม ═══════════════════════════ */
const timerRoutes = require("./routes/timerRoutes");
// const firmwareRoutes = require("./routes/firmwareRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
// const otaRoutes = require("./routes/otaRoutes-");
const systemRoutes = require("./routes/systemRoutes");

/* ═══ Routes ใหม่ ════════════════════════════ */
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const merchantRoutes = require("./routes/merchantRoutes");
const sharedRoutes = require("./routes/sharedRoutes");
const paymentRoutes = require("./routes/paymentRoutes"); // ✅ เพิ่ม

/* ═══ Project ════ */
const projectRoutes = require("./routes/projectRoutes");
/* ═══ Payment controller (webhook + test) ════ */
const paymentController = require("./controllers/paymentController");

// income

const incomeRoutes = require("./routes/incomeRoutes");

/* ═══ App Setup ══════════════════════════════ */
const app = express();
const server = http.createServer(app);
const io = initSocket(server);

// ✅ ส่ง io ให้ paymentController ใช้ emit ได้
paymentController.setIO(io);

app.use(
  cors({
    origin: "*", // หรือใส่ domain จริงก็ได้
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    //allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 🔥 สำคัญมาก
// app.options("*", cors());

// app.use((req,res,next)=>{
//   if (req.method==="OPTIONS"){
//     return res.sendStatus(200);
//   }
//   next();
// })

app.use(express.json());
app.use(express.static("public"));

app.use("/uploads", cors(), express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 9369;

/* ═══ Load data ══════════════════════════════ */
let deviceStore = loadDeviceFile();
let groups = loadGroup();

/* ═══ Maps ═══════════════════════════════════ */
const clients = new Map();
const webClients = new Map();
const espClients = new Map();
const deviceRuntime = new Map();

/* ═══ Helper ═════════════════════════════════ */
function saveDevice(deviceId) {
  if (!deviceId) return false;
  if (deviceStore[deviceId]) return false;

  deviceStore[deviceId] = { created: new Date().toISOString() };
  try {
    fs.writeFileSync("device_id.json", JSON.stringify(deviceStore, null, 2));
    console.log("🆕 New device saved:", deviceId);
    return true;
  } catch (e) {
    console.log("❌ Write device error:", e.message);
    return false;
  }
}

/* ══════════════════════════════════════════════
   ROUTES
══════════════════════════════════════════════ */

/* ── PUBLIC (ไม่ต้อง token) ── */
app.use("/api/auth", authRoutes);

/* ── KSher webhook — raw text, ไม่มี auth ── */
app.post("/notify", bodyParser.text({ type: "*/*" }), paymentController.notify);

/* ── Project ── */
app.use("/api/project", projectRoutes); // ✅

/* ── Manual trigger / test payment ── */
app.post("/notify-success", express.json(), paymentController.notifySuccess);
app.get("/test-payment/:deviceId", paymentController.testPayment);

/* ── Legacy health check ── */
app.get("/payment_ksher", (req, res) => res.send("START PAYMENT"));
app.get("/runksher", (req, res) => res.send("KSher PromptPay API Running"));

/* ── ADMIN เท่านั้น 🔒 ── */
app.use("/api/admin", adminRoutes);

/* ── MERCHANT + ADMIN 🔑 ── */
app.use("/api/merchant", merchantRoutes);
// app.use("/api/merchant", (req, res, next) => {
//   console.log("🛣️ merchantRoutes hit:", req.method, req.path);
//   next();
// });

/* ── INCOME 🔑 ── */
app.use("/api/income", incomeRoutes);

app.use("/api", require("./routes/devicePublicRoutes"));

/* ── SHARED (token ทุก role) ── */
app.use("/api", sharedRoutes);

/* ── Payment routes (สำหรับ direct access) ── */
app.use("/", paymentRoutes);

/* ── SYSTEM / DEVICE / OTA / TIMER (เดิม) ── */
app.use(deviceRoutes(io));
app.use(timerRoutes);
// app.use(firmwareRoutes);
// app.use(otaRoutes(io, espClients, deviceRuntime, groups));
app.use(
  systemRoutes(io, espClients, deviceRuntime, deviceStore, clients, groups)
);

/* ══════════════════════════════════════════════
   MQTT
══════════════════════════════════════════════ */
initMQTT(client, io, deviceRuntime, saveDevice, MQTT_PREFIX);

/* ══════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════ */
server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});

/* ══════════════════════════════════════════════
   TIMEOUT WATCHDOG — ตรวจ device offline
══════════════════════════════════════════════ */
const TIMEOUT = 60000; // 60 วินาที
const { updateDeviceStatus } = require("./utils/deviceStatus"); // ← เพิ่ม import

setInterval(async () => {
  const now = Date.now();

  // ✅ debug — ดูว่า watchdog ทำงานไหมและมี device ไหม
  console.log(`🔍 Watchdog: ${deviceRuntime.size} devices in runtime`);

  for (const [id, rt] of deviceRuntime.entries()) {
    console.log(
      `   ${id}: online=${rt.online} lastSeen=${
        rt.lastSeen ? Math.round((now - rt.lastSeen) / 1000) + "s ago" : "never"
      }`
    );

    if (!rt.lastSeen) continue;
    if (now - rt.lastSeen > TIMEOUT && rt.online) {
      rt.online = false;
      deviceRuntime.set(id, rt);
      await updateDeviceStatus(id, false);
      io.emit("device-offline", { deviceId: id });
      console.log("⛔ Timeout offline:", id, `| diff: ${now - rt.lastSeen}ms`);
    }
  }
}, 10000);
