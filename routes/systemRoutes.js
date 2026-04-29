// routes/systemRoutes.js

const express = require("express");

module.exports = (
  io,
  espClients,
  deviceRuntime,
  deviceStore,
  clients,
  groups
) => {
  const router = express.Router();
  const controller = require("../controllers/systemController");

  router.get("/groups", controller.getGroups(groups));

  router.get("/devices", controller.getDevices(deviceStore, deviceRuntime));

  router.post("/machine-status", controller.machineStatus(io, espClients));

  router.post("/api/send", controller.sendWithToken(io, clients));

  return router;
};
