const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const authController = require("../controllers/authController");

router.post("/login", authController.login);
router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logout);

router.get("/me", auth, authController.getMe);

// เพิ่มใน authRoutes.js
router.post("/line-callback", auth, authController.saveLineUserId);
router.delete("/line-unlink", auth, authController.unlinkLine);
router.post("/line-test", auth, authController.testLineNotify); // ✅ เพิ่ม

module.exports = router;
