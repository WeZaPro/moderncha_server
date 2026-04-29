const { Server } = require("socket.io");

function initSocket(server) {
  const io = new Server(server, {
    path: "/port8000/",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket"],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    perMessageDeflate: false,
  });

  return io;
}

module.exports = initSocket;
