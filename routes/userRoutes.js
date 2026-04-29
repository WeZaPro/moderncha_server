const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

// admin เท่านั้น
router.post("/create-user", auth, role("admin"), userController.createUser);

// admin เท่านั้น
router.post(
  "/create-merchant",
  auth,
  role("admin"),
  userController.createMerchant
);

router.post(
  "/create-service",
  auth,
  role("admin"),
  userController.createService
);

module.exports = router;
