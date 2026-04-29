const crypto = require("crypto");
const fs = require("fs");

const DEVICE_FILE = "device_id.json";
const GROUP_FILE = "device_group.json";
const TOKEN_SECRET = "my_super_secret_key";

function generateToken(clientId) {
  return crypto
    .createHash("sha256")
    .update(clientId + TOKEN_SECRET)
    .digest("hex");
}

function loadDeviceFile() {
  try {
    if (!fs.existsSync(DEVICE_FILE)) {
      fs.writeFileSync(DEVICE_FILE, JSON.stringify({}, null, 2));
      return {};
    }

    const raw = fs.readFileSync(DEVICE_FILE, "utf8");

    if (!raw || raw.trim() === "") {
      fs.writeFileSync(DEVICE_FILE, JSON.stringify({}, null, 2));
      return {};
    }

    return JSON.parse(raw);
  } catch {
    fs.writeFileSync(DEVICE_FILE, JSON.stringify({}, null, 2));
    return {};
  }
}

function loadGroup() {
  if (!fs.existsSync(GROUP_FILE)) {
    fs.writeFileSync(GROUP_FILE, JSON.stringify({}, null, 2));
    return {};
  }
  return JSON.parse(fs.readFileSync(GROUP_FILE));
}

module.exports = {
  generateToken,
  loadDeviceFile,
  loadGroup,
};
