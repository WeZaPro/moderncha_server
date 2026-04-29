// controllers/systemController.js

exports.getGroups = (groups) => (req, res) => {
  res.json(groups);
};

exports.getDevices = (deviceStore, deviceRuntime) => (req, res) => {
  const out = {};

  for (const id of Object.keys(deviceStore)) {
    const rt = deviceRuntime.get(id);

    out[id] = {
      online: rt ? rt.online : false,
      lastSeen: rt?.lastSeen || null,
    };
  }

  res.json(out);
};

exports.machineStatus = (io, espClients) => (req, res) => {
  const { deviceId, value } = req.body;

  const payload = [
    {
      cmd: "set-machine",
      value: value,
    },
  ];

  if (deviceId === "all") {
    io.emit("device-cmd", payload);
  } else {
    const esp = espClients.get(deviceId);
    if (esp) {
      io.to(esp.socketId).emit("device-cmd", payload);
    }
  }

  res.json({ ok: true });
};

exports.sendWithToken = (io, clients) => (req, res) => {
  const { clientId, token, message } = req.body;

  const client = clients.get(clientId);

  if (!client) {
    return res.status(404).json({ error: "client not connected" });
  }

  if (client.token !== token) {
    return res.status(401).json({ error: "invalid token" });
  }

  io.to(client.socketId).emit("server_push", {
    message,
    time: new Date().toISOString(),
  });

  res.json({ success: true });
};
