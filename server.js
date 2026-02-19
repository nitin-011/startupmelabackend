import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import connectDB from "./config/db.js";
import apiRouter from "./routes/apiRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import uploadRouter from "./routes/uploadRoutes.js";
import { socketAuthMiddleware, guestAuthMiddleware } from "./middleware/socketAuth.js";

const app = express();
const httpServer = createServer(app);

// -----------------------------------------
// 1. CORS CONFIGURATION
// -----------------------------------------
const allowedOrigins = [
  "https://startupmela.com",
  "https://www.startupmela.com",
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const isAllowedOrigin =
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

    if (isAllowedOrigin) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 200,
};

// Apply CORS middleware globally
app.use(cors(corsOptions));

// Handle preflight requests explicitly across all routes
app.options('*', cors(corsOptions));

// -----------------------------------------
// 1B. SOCKET.IO CONFIGURATION
// -----------------------------------------
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"]
  },
  transports: ["websocket", "polling"], // Fallback to polling if WebSocket unavailable
  pingInterval: 25000,
  pingTimeout: 60000,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// Admin namespace for authenticated admin connections
const adminNamespace = io.of("/admin");
adminNamespace.use(socketAuthMiddleware);

adminNamespace.on("connection", (socket) => {
  console.log(`✅ Admin client connected. Socket ID: ${socket.id}, User: ${socket.userEmail}`);

  socket.on("disconnect", (reason) => {
    console.log(`🔌 Admin client disconnected. Socket ID: ${socket.id}, Reason: ${reason}`);
  });

  socket.on("error", (error) => {
    console.error(`❌ Admin socket error (${socket.id}):`, error);
  });
});

// Checkout namespace for public connections (payment tracking)
const checkoutNamespace = io.of("/checkout");
checkoutNamespace.use(guestAuthMiddleware);

checkoutNamespace.on("connection", (socket) => {
  console.log(`✅ Checkout client connected. Socket ID: ${socket.id}`);

  socket.on("join:order", (orderId) => {
    socket.join(`order-${orderId}`);
    console.log(`📍 Socket ${socket.id} joined order tracking: order-${orderId}`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔌 Checkout client disconnected. Socket ID: ${socket.id}, Reason: ${reason}`);
  });

  socket.on("error", (error) => {
    console.error(`❌ Checkout socket error (${socket.id}):`, error);
  });
});

// Export io instance globally for controllers to access
global.io = io;
global.adminNamespace = adminNamespace;
global.checkoutNamespace = checkoutNamespace;

app.use(express.json());

// -----------------------------------------
// 2. DB CONNECTION MIDDLEWARE
// -----------------------------------------
// On Vercel, it's safer to ensure DB is connected before handling the request
// rather than fire-and-forget at the top level.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database Connection Failed:", error);
    res.status(500).json({ error: "Database Connection Failed" });
  }
});

// -----------------------------------------
// 3. ROUTES
// -----------------------------------------
app.use("/api", apiRouter);
app.use("/api/admin", adminRouter);
app.use("/api/upload", uploadRouter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: "production"
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);
  res.status(500).json({ error: err.message });
});

export { httpServer, app, io };