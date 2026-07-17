const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const walletRoutes = require("./routes/walletRoutes");
const depositRoutes = require("./routes/depositRoutes");
const withdrawRoutes = require("./routes/withdrawRoutes");
const adminWithdrawRoutes = require("./routes/adminWithdrawRoutes");
const adminDepositRoutes = require("./routes/adminDepositRoutes");
const adminAnalyticsRoutes = require("./routes/adminAnalyticsRoutes");
const adminContentRoutes = require("./routes/adminContentRoutes");
const contentRoutes = require("./routes/contentRoutes");
const referralRoutes = require("./routes/referralRoutes");
const vipRoutes = require("./routes/vipRoutes");
const taskRoutes = require("./routes/taskRoutes");
const prelaunchRoutes = require("./routes/prelaunchRoutes");
const bonusRoutes = require("./routes/bonusRoutes");
const alchemyWebhookRoutes = require("./routes/alchemyWebhookRoutes");
const { startAutomaticDepositScanner } = require("./services/depositScannerService");
const { ensureRedeemCodeLimitSchema } = require("./services/redeemCodeLimitService");
const { apiRateLimiter } = require("./middleware/rateLimitMiddleware");

const app = express();
app.set("trust proxy", 1);

function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

function parseOriginList(value) {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

const allowedOrigins = Array.from(new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3005",
  "http://localhost:3100",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3005",
  "http://127.0.0.1:3100",
  "https://royalimperial.lat",
  "https://www.royalimperial.lat",
  "https://royalimperial.lat",
  "https://www.royalimperial.lat",
  process.env.FRONTEND_URL,
  ...parseOriginList(process.env.ALLOWED_ORIGINS),
].map(normalizeOrigin).filter(Boolean)));

function isRenderPreviewOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin || "");
}

function isAllowedOrigin(origin) {
  const cleanOrigin = normalizeOrigin(origin);
  if (!cleanOrigin) return true;
  if (allowedOrigins.includes(cleanOrigin)) return true;
  if (process.env.ALLOW_RENDER_PREVIEWS === "true" && isRenderPreviewOrigin(cleanOrigin)) return true;
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`CORS bloqueado para origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf ? buf.toString("utf8") : ""; } }));
app.use("/api", apiRateLimiter);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.get("/", (req, res) => res.json({ message: "Backend Royal Imperial AI funcionando correctamente.", version: "1.0.91" }));

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/deposits", depositRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api", contentRoutes);
app.use("/api/admin", adminAnalyticsRoutes);
app.use("/api/admin", adminContentRoutes);
app.use("/api/admin", adminWithdrawRoutes);
app.use("/api/admin", adminDepositRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/vip", vipRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/prelaunch", prelaunchRoutes);
app.use("/api/bonus", bonusRoutes);
app.use("/api/webhooks/alchemy", alchemyWebhookRoutes);


app.use((err, req, res, next) => {
  console.error("API ERROR:", err);
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    message: process.env.NODE_ENV === "production"
      ? "Error interno del servidor."
      : (err.message || "Error interno del servidor."),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Royal Imperial AI backend corriendo en http://localhost:${PORT}`);
  ensureRedeemCodeLimitSchema()
    .then(() => console.log("Límites diarios de códigos preparados."))
    .catch((error) => console.error("REDEEM LIMIT STARTUP ERROR:", error));
  startAutomaticDepositScanner();
  console.log("Escaneo automático de recargas activo. Recolección manual desde admin si está configurada.");
});
