// index.js
import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

// 서버 리스트 메모리 저장
let servers = new Map(); // key: userId, value: { name, ip, port, timestamp }

app.get("/", (req, res) => {
  res.send("Relay Server Running");
});

// WebSocket 서버 생성
const wss = new WebSocketServer({ noServer: true });

// 연결 시 처리
wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // 월드 등록
      if (data.type === "register") {
        servers.set(data.userId, {
          name: data.name,
          ip: data.ip,
          port: data.port,
          timestamp: Date.now(),
        });
        ws.send(JSON.stringify({ type: "ok", message: "Registered" }));
      }

      // 월드 리스트 요청
      if (data.type === "list") {
        const list = [...servers.values()];
        ws.send(JSON.stringify({ type: "list", servers: list }));
      }
    } catch (err) {
      console.error(err);
    }
  });

  ws.on("close", () => {});
});

// Express와 WebSocket 연결
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
