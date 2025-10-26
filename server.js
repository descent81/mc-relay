// server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import net from "net";

const app = express();
app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const sessions = {};
const detectedServers = new Map();

console.log("🚀 중계 서버 시작 중...");

wss.on("connection", (ws) => {
  console.log("📱 새 WebSocket 연결됨");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "lan-detected") {
        const mcServer = data.mcServer;
        const key = `${mcServer.host}:${mcServer.port}`;
        console.log(`🔍 LAN 서버 감지: ${mcServer.name} @ ${key}`);

        const sessionId = `lan-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        sessions[sessionId] = {
          id: sessionId,
          host: ws,
          clients: new Map(),
          mcServer,
          createdAt: Date.now(),
        };

        detectedServers.set(key, { ...mcServer, sessionId, lastSeen: Date.now() });

        ws.send(JSON.stringify({ type: "created", id: sessionId, mcServer }));
        console.log(`✅ 자동 세션 생성됨: ${sessionId}`);
        return;
      }

      if (data.type === "create-session") {
        const sessionId = data.id;
        sessions[sessionId] = {
          id: sessionId,
          host: ws,
          clients: new Map(),
          mcServer: data.mcServer,
          createdAt: Date.now(),
        };
        ws.send(JSON.stringify({ type: "created", id: sessionId }));
      }

      if (data.type === "join-session") {
        const session = sessions[data.id];
        if (!session) {
          ws.send(JSON.stringify({ type: "error", message: "세션을 찾을 수 없습니다" }));
          return;
        }

        const tcpSocket = new net.Socket();
        tcpSocket.connect(session.mcServer.port, session.mcServer.host, () => {
          console.log(`🔌 연결됨: ${session.mcServer.host}:${session.mcServer.port}`);
          session.clients.set(ws, tcpSocket);

          ws.send(JSON.stringify({
            type: "joined",
            id: data.id,
            clientCount: session.clients.size,
            mcServer: session.mcServer,
          }));

          session.host.send(JSON.stringify({
            type: "client-joined",
            clientCount: session.clients.size,
          }));
        });

        tcpSocket.on("data", (buffer) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: "mc-data",
              data: buffer.toString("base64"),
            }));
          }
        });

        tcpSocket.on("close", () => {
          console.log("🔌 TCP 연결 종료");
          session.clients.delete(ws);
        });

        tcpSocket.on("error", (err) => {
          console.error("❌ TCP 오류:", err.message);
          ws.send(JSON.stringify({
            type: "error",
            message: `MC 서버 연결 실패: ${err.message}`,
          }));
        });
      }
    } catch (err) {
      console.error("⚠️ 메시지 처리 오류:", err);
    }
  });

  ws.on("close", () => {
    console.log("📱 WebSocket 연결 종료");
  });
});

// API 엔드포인트
app.get("/", (req, res) => {
  res.json({
    status: "online",
    sessions: Object.keys(sessions).length,
    detectedServers: detectedServers.size,
    message: "마인크래프트 중계 서버 동작 중",
  });
});

app.get("/api/sessions", (req, res) => {
  const sessionList = Object.values(sessions).map((s) => ({
    id: s.id,
    clientCount: s.clients.size,
    mcServer: s.mcServer,
    createdAt: s.createdAt,
  }));
  res.json(sessionList);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: 포트 ${PORT}`);
});
