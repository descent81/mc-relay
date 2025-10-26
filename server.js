// index.js
import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // JSON 파싱

// 서버 리스트 메모리 저장
let servers = new Map(); // key: userId, value: { name, ip, port, timestamp }

// --------------------
// HTTP API
// --------------------

// 세션 목록 조회 (Flutter에서 /api/sessions 요청)
app.get("/api/sessions", (req, res) => {
  const list = [...servers.values()].map((s, i) => ({
    id: String(i + 1),
    clientCount: 0,
    mcServer: s,
    createdAt: s.timestamp,
  }));
  res.json(list);
});

// 월드 등록 (Flutter에서 /api/register 요청)
app.post("/api/register", (req, res) => {
  try {
    const body = req.body;
    if (!body.mcServer) {
      return res.status(400).json({ error: "mcServer missing" });
    }

    const data = body.mcServer;
    const entry = {
      name: data.name || "Unknown",
      ip: data.host || "0.0.0.0",
      port: data.port || 19132,
      timestamp: Date.now(),
    };

    servers.set(`${entry.ip}:${entry.port}`, entry);

    // WebSocket에 알림
    broadcast({ type: "listChanged" });

    console.log("🌐 월드 등록됨:", entry);
    res.json({ success: true });
  } catch (e) {
    console.error("등록 실패:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => {
  res.send("Relay Server Running");
});

// --------------------
// WebSocket 서버 생성
// --------------------
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // WebSocket 등록 (예전 코드 유지)
      if (data.type === "register") {
        servers.set(data.userId || `${Date.now()}`, {
          name: data.name,
          ip: data.ip,
          port: data.port,
          timestamp: Date.now(),
        });
        ws.send(JSON.stringify({ type: "ok", message: "Registered" }));
        broadcast({ type: "listChanged" });
      }

      // 리스트 요청
      if (data.type === "list") {
        const list = [...servers.values()];
        ws.send(JSON.stringify({ type: "list", servers: list }));
      }
    } catch (err) {
      console.error("WS 오류:", err);
    }
  });

  ws.on("close", () => {});
});

// --------------------
// 공용 브로드캐스트 함수
// --------------------
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

// --------------------
// Express + WebSocket 연결
// --------------------
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
