const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const { setTimer } = require("../controllers/timerController");

router.use(auth, role("admin"));

router.post("/set-timer", setTimer);

module.exports = router;
