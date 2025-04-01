/**
 * @file WebRTC signaling server ka code hai, jo WebSocket aur Express ka istemal karta hai.
 * @description Bhaiya, yeh server WebRTC ke liye signaling ka kaam karta hai,
 * rooms ka intezam karta hai, aur spamers ko thoda tight rakhta hai.
 *
 * Features:
 * - WebSocket connections ka intezam
 * - Rooms ka management (create, join, leave)
 * - Chat aur signaling messages ka handling
 * - Rate limiting aur security middleware
 * - Heartbeat se zinda connections ka pata lagana
 *
 * Bhaiya, yeh code likhne ke baad chai zaroor peena, kaafi kaam kiya hai!
 */

import { WebSocket, WebSocketServer } from "ws";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { z } from "zod"; // validation krwa lete h
import cors from "cors";
import pino from "pino";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// Logger bhaiya yaha pr kaam karenge
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: true,
});

// Message ka validation schemas
const joinSchema = z.object({
  type: z.literal("join"),
  userId: z.string().uuid(),
  roomId: z.string().min(3).max(50),
  displayName: z.string().max(50).optional().default("Anonymous"),
});

const signalingSchema = z.object({
  type: z.enum(["offer", "answer", "ice-candidate"]),
  target: z.string().uuid(),
  data: z.any(),
});

const chatSchema = z.object({
  type: z.literal("chat-message"),
  data: z.string().max(2000),
});

// Types definition
interface PeerData {
  ws: WebSocket;
  displayName: string;
  joinTime: number;
  transactionId: string;
  messageCount: number;
  lastMessageTime: number;
}

interface ChatMessage {
  from: string;
  displayName: string;
  text: string;
  time: number;
  id: string;
}

interface Room {
  peers: Map<string, PeerData>;
  created: number;
  messages: ChatMessage[];
  id: string;
}

// Hamara Express app - security middleware ke sath
const app = express();
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "16kb" }));

// Rate limiting bhi lagana jaroori h
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit krte h ek IP ko 100 requests per windowMs ke liye
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
  },
});

// Bhaiya yaha pr rooms ka intezam Map ke saath kiya h, taaki fatafat access ho jaye
const rooms = new Map<string, Room>();

// Bhaiya, yaha pr message bhejne ki speed limit lagayi h, warna log spam karenge aur server ko thakaa denge
const MESSAGE_RATE_LIMIT = 10; // Ek second me max 10 message bhejne ki permission
const MESSAGE_RATE_WINDOW = 1000; // Window ka size 1 second ka h, zyada mat udna

// Heartbeat configuration - Bhaiya, har 30 second me dil ki dhadkan check karte hain
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 40000;

function heartbeat(this: WebSocket) {
  (this as any).isAlive = true;
  (this as any).lastHeartbeat = Date.now();
}

// Bhai server zinda hai ya gaya, yaha check karlo
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    connections: wss.clients.size,
    rooms: rooms.size,
  });
});

// Bhaiya yaha se pata chalega kaun kitna busy hai
app.get("/api/stats", (req: Request, res: Response) => {
  const stats = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    created: new Date(room.created).toISOString(),
    participants: room.peers.size,
    messageCount: room.messages.length,
  }));

  res.status(200).json({
    rooms: stats,
    totalParticipants: wss.clients.size,
  });
});

// Bhaiya yaha se Websocket connection ka khel shuru hota hai
wss.on("connection", function connection(ws: WebSocket) {
  const connectionId = randomUUID();
  logger.info({ connectionId }, "New WebSocket connection");

  // Bhai connection ka state yaha set karte hain, taaki sab smooth chale
  (ws as any).isAlive = true;
  (ws as any).lastHeartbeat = Date.now();
  (ws as any).connectionId = connectionId;
  ws.on("pong", heartbeat);

  // User session data
  let userId: string | null = null;
  let roomId: string | null = null;
  let displayName: string | null = null;
  let currentRoom: Room | null = null;

  // Error ko thoda handle kr lete h
  ws.on("error", (error) => {
    logger.error(
      {
        error: error.message,
        connectionId,
        userId,
        roomId,
      },
      "WebSocket error"
    );
  });

  // Bhaiya yaha se message ka khel shuru hota hai
  ws.on("message", async function handleMessage(data: any) {
    // Bhaiya, message bhejne ki speed check karte hain, spam mat machao
    const now = Date.now();
    const peer = currentRoom?.peers.get(userId as string);

    if (peer) {
      const messageInterval = now - peer.lastMessageTime;
      peer.messageCount =
        messageInterval > MESSAGE_RATE_WINDOW ? 1 : peer.messageCount + 1;
      peer.lastMessageTime = now;

      if (peer.messageCount > MESSAGE_RATE_LIMIT) {
        logger.warn({ userId, roomId }, "Rate limit exceeded");
        ws.send(
          JSON.stringify({
            type: "error",
            code: 429,
            message: "Rate limit exceeded, please slow down",
          })
        );
        return;
      }
    }

    try {
      // Bhaiya, message ka size limit karte hain, warna server ka pet phat jayega
      if (data.length > 65536) {
        // 64KB
        throw new Error("Message too large");
      }

      const message = JSON.parse(data.toString());
      const transactionId = randomUUID();

      // Bhaiya, message ka type dekh ke kaam karte hain, warna sab golmaal ho jayega
      switch (message.type) {
        case "join":
          try {
            const joinData = joinSchema.parse(message);
            userId = joinData.userId;
            roomId = joinData.roomId;
            displayName = joinData.displayName;

            logger.info(
              {
                userId,
                roomId,
                displayName,
                transactionId,
              },
              "User joining room"
            );

            // Room banaye ya purana room uthaye, bas kaam chalana hai
            if (!rooms.has(roomId)) {
              rooms.set(roomId, {
                peers: new Map(),
                created: now,
                messages: [],
                id: roomId,
              });
            }

            currentRoom = rooms.get(roomId) as Room;

            // Bhai user ko room mein ghusa diya
            currentRoom.peers.set(userId, {
              ws,
              displayName,
              joinTime: now,
              transactionId,
              messageCount: 0,
              lastMessageTime: now,
            });

            // Bhai recent chat ka kachumber bhej rahe hain
            const recentMessages = currentRoom.messages.slice(-20);
            if (recentMessages.length > 0) {
              ws.send(
                JSON.stringify({
                  type: "chat-history",
                  messages: recentMessages,
                  transactionId,
                })
              );
            }

            // Room ke logon ko ek dusre ke baare me bata dete hain
            for (const [peerId, peerData] of currentRoom.peers.entries()) {
              if (peerId !== userId) {
                // Purane peer ko naye aadmi ka update dete hain
                peerData.ws.send(
                  JSON.stringify({
                    type: "user-joined",
                    userId,
                    displayName,
                    timestamp: now,
                    transactionId,
                  })
                );

                // Naye aadmi ko purane logon ka update dete hain
                ws.send(
                  JSON.stringify({
                    type: "user-joined",
                    userId: peerId,
                    displayName: peerData.displayName,
                    timestamp: now,
                    transactionId,
                  })
                );
              }
            }

            // user ko confirm kar dete hain ki join ho gaya
            ws.send(
              JSON.stringify({
                type: "join-success",
                roomId,
                participantCount: currentRoom.peers.size,
                transactionId,
              })
            );
          } catch (err: any) {
            logger.warn({ err: err.message }, "Invalid join message");
            ws.send(
              JSON.stringify({
                type: "error",
                code: 400,
                message: "Invalid join data",
                details: err.errors || err.message,
              })
            );
          }
          break;

        case "offer":
        case "answer":
        case "ice-candidate":
          try {
            if (!userId || !roomId || !currentRoom) {
              throw new Error("Not joined to a room");
            }

            const signalingData = signalingSchema.parse(message);
            const targetPeer = currentRoom.peers.get(signalingData.target);

            if (targetPeer) {
              targetPeer.ws.send(
                JSON.stringify({
                  type: signalingData.type,
                  data: signalingData.data,
                  from: userId,
                  displayName,
                  timestamp: now,
                  transactionId,
                })
              );

              logger.debug(
                {
                  type: signalingData.type,
                  from: userId,
                  to: signalingData.target,
                  transactionId,
                },
                "Forwarded signaling message"
              );
            } else {
              ws.send(
                JSON.stringify({
                  type: "error",
                  code: 404,
                  message: "Target peer not found",
                  transactionId,
                })
              );
            }
          } catch (err: any) {
            logger.warn({ err: err.message }, "Invalid signaling message");
            ws.send(
              JSON.stringify({
                type: "error",
                code: 400,
                message: "Invalid signaling data",
                details: err.errors || err.message,
              })
            );
          }
          break;

        case "chat-message":
          try {
            if (!userId || !roomId || !currentRoom) {
              throw new Error("Not joined to a room");
            }

            const chatData = chatSchema.parse(message);
            const messageId = randomUUID();

            // Naya chat message banate hain
            const chatMessage: ChatMessage = {
              from: userId,
              displayName: displayName || "Anonymous",
              text: chatData.data,
              time: now,
              id: messageId,
            };

            // Room ki history mein message chipka dete hain
            currentRoom.messages.push(chatMessage);

            // Sirf 100 messages ka stock rakhte hain, baaki delete
            if (currentRoom.messages.length > 100) {
              currentRoom.messages = currentRoom.messages.slice(-100);
            }

            // Sender ke alawa sabko message forward karte hain
            for (const [peerId, peerData] of currentRoom.peers.entries()) {
              if (peerId !== userId) {
                peerData.ws.send(
                  JSON.stringify({
                    type: "chat-message",
                    ...chatMessage,
                    transactionId,
                  })
                );
              }
            }

            // Sender ko confirm karte hain ki message mil gaya
            ws.send(
              JSON.stringify({
                type: "message-ack",
                id: messageId,
                timestamp: now,
                transactionId,
              })
            );

            logger.debug(
              {
                userId,
                roomId,
                messageId,
                transactionId,
              },
              "Chat message processed"
            );
          } catch (err: any) {
            logger.warn({ err: err.message }, "Invalid chat message");
            ws.send(
              JSON.stringify({
                type: "error",
                code: 400,
                message: "Invalid chat message",
                details: err.errors || err.message,
              })
            );
          }
          break;

        default:
          logger.warn({ messageType: message.type }, "Unknown message type");
          ws.send(
            JSON.stringify({
              type: "error",
              code: 400,
              message: "Unknown message type",
            })
          );
      }
    } catch (error: any) {
      logger.error({ error: error.message }, "Error processing message");
      ws.send(
        JSON.stringify({
          type: "error",
          code: 500,
          message: "Internal server error",
        })
      );
    }
  });

  // Bhaiya, agar user bhaag gaya to yaha handle karenge
  ws.on("close", () => {
    if (userId && roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId) as Room;

      logger.info({ userId, roomId, displayName }, "User disconnected");

      // Room se user ko nikal diya
      room.peers.delete(userId);

      // Baaki logon ko bata diya ki user bhaag gaya
      for (const [_, peerData] of room.peers.entries()) {
        peerData.ws.send(
          JSON.stringify({
            type: "user-left",
            userId,
            displayName,
            timestamp: Date.now(),
          })
        );
      }

      // Agar room khaali ho gaya to usko hata diya
      if (room.peers.size === 0) {
        logger.info({ roomId }, "Room is empty, removing");
        rooms.delete(roomId);
      }
    }
  });
});
const heartbeatInterval = setInterval(() => {
  const now = Date.now();

  wss.clients.forEach((ws) => {
    if (
      (ws as any).isAlive === false ||
      now - (ws as any).lastHeartbeat > HEARTBEAT_TIMEOUT
    ) {
      logger.debug(
        { connectionId: (ws as any).connectionId },
        "Terminating inactive connection"
      );
      return ws.terminate();
    }

    (ws as any).isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// Bhaiya, server band hone par saaf safai karte hain
wss.on("close", () => {
  clearInterval(heartbeatInterval);
  logger.info("WebSocket server closed");
});

// Bhaiya, server ko start karte hain
const PORT = parseInt(process.env.PORT || "8080");
server.listen(PORT, () => {
  logger.info({ port: PORT }, "WebRTC signaling server started");
});

// Bhaiya, shutdown ka bhi intezam hai
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});
