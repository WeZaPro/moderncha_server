const multer = require("multer");
const path = require("path");

const FIRMWARE_DIR = "firmware";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, FIRMWARE_DIR + "/");
  },
  filename: function (req, file, cb) {
    const name = Date.now() + "_" + file.originalname;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".bin") {
      return cb(new Error("Only bin allowed"));
    }
    cb(null, true);
  },
});

module.exports = { upload, FIRMWARE_DIR };
