import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import apiRouter from "./routes/apiRoutes.js";

const app = express();

// -----------------------------------------
// 1. CORS CONFIGURATION
// -----------------------------------------
const corsOptions = {
  origin: "https://startup-mela-beta.vercel.app",
  credentials: true, // Allow cookies/headers
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Apply CORS middleware globally
app.use(cors(corsOptions));

// Handle preflight requests explicitly across all routes
app.options('*', cors(corsOptions));

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

export default app;