// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const userController = require("../controllers/userController");
// const firmwareController = require("../controllers/firmwareController-");
const merchantController = require("../controllers/merchantController");
const merchantConfigController = require("../controllers/merchantConfigController");
const multer = require("multer");

const { upload } = require("../config/upload");

// ── multer สำหรับ .pem file ──────────────────
const pemUpload = multer({
  dest: "/tmp/ksher_uploads/",
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith(".pem")) {
      return cb(new Error("Only .pem files allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 64 * 1024 }, // 64KB
});

// middleware ตรวจ content-type → เลือก parser
const pemOrJson = (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    pemUpload.single("ksher_key_file")(req, res, next);
  } else {
    express.json()(req, res, next);
  }
};

router.use(auth, role("admin"));
//-----device------------
router.get("/devices", merchantController.getMyDevices);
router.put("/devices/:id", merchantController.updateDevice);
// ── user management ───────────────────────────
router.post("/users/create-user", userController.createUser);
router.post("/users/create-merchant", userController.createMerchant);
router.delete("/users/:id", userController.deleteUser);

router.get("/users", userController.getAllUsers);
router.get("/users/:id", userController.getUserById);
router.put("/users/:id", userController.updateUser); // ✅ NEW

// ── merchant management ───────────────────────
router.get("/merchants", merchantController.getAllMerchants);
router.post("/devices/assign", merchantController.assignDevice);
router.post("/devices/unassign", merchantController.unassignDevice);

//-----service-------
router.post("/users/create-service", userController.createService);

// ── orders (ทุก merchant) ─────────────────────
// router.get("/orders", merchantController.getAllOrders);

// ── KSher config ต่อ merchant ─────────────────
router.get("/merchant-configs", merchantConfigController.getAll);
router.get("/merchant-configs/:merchantId", merchantConfigController.getOne);
// router.post(
//   "/merchant-configs",
//   pemUpload.single("ksher_key_file"), // ✅ รองรับ upload .pem
//   merchantConfigController.upsert
// );

router.post(
  "/merchant-configs",
  (req, res, next) => {
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      pemUpload.single("ksher_key_file")(req, res, next); // ✅ มีไฟล์
    } else {
      express.json()(req, res, next); // ✅ JSON
    }
  },
  merchantConfigController.upsert
);

// ✅ PUT — update เฉพาะ field ที่ส่งมา (partial update)
router.put(
  "/merchant-configs/:merchantId",
  pemOrJson,
  merchantConfigController.update
);

router.delete("/merchant-configs/:merchantId", merchantConfigController.remove);

module.exports = router;
