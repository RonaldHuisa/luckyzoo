const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const walletRoutes = require("./routes/walletRoutes");
const depositRoutes = require("./routes/depositRoutes");
const withdrawRoutes = require("./routes/withdrawRoutes");
const adminWithdrawRoutes = require("./routes/adminWithdrawRoutes");
const adminStatusRoutes = require("./routes/adminStatusRoutes");
const adminDepositRoutes = require("./routes/adminDepositRoutes");
const adminSecurityRoutes = require("./routes/adminSecurityRoutes");
const adminGrowthRoutes = require("./routes/adminGrowthRoutes");
const referralRoutes = require("./routes/referralRoutes");
const vipRoutes = require("./routes/vipRoutes");
const taskRoutes = require("./routes/taskRoutes");
const miningRoutes = require("./routes/miningRoutes");
const hashRewardsRoutes = require("./routes/hashRewardsRoutes");
const reinvestRoutes = require("./routes/reinvestRoutes");
const marketRoutes = require("./routes/marketRoutes");
const alchemyWebhookRoutes = require("./routes/alchemyWebhookRoutes");
const promoEventRoutes = require("./routes/promoEventRoutes");
const adminPromoEventRoutes = require("./routes/adminPromoEventRoutes");
const { startAutomaticDepositScanner } = require("./services/depositScannerService");
const { apiRateLimiter } = require("./middleware/rateLimitMiddleware");


const app = express();
app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3005",
  "http://localhost:3100",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3005",
  "http://127.0.0.1:3100",
  "https://greenvest-platform.onrender.com",
  "https://greenvest.lat",
  "https://www.greenvest.lat",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error("CORS bloqueado para origin:", origin);
    return callback(new Error(`CORS bloqueado para origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf ? buf.toString("utf8") : "";
  },
}));

app.use("/api", apiRateLimiter);

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
});

app.get("/", (req, res) => {
  res.json({
    message: "Backend GreenVest funcionando correctamente.",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/deposits", depositRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/admin", adminWithdrawRoutes);
app.use("/api/admin", adminStatusRoutes);
app.use("/api/admin", adminDepositRoutes);
app.use("/api/admin", adminSecurityRoutes);
app.use("/api/admin", adminGrowthRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/vip", vipRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/mining", miningRoutes);
app.use("/api/hash-rewards", hashRewardsRoutes);
app.use("/api/reinvest", reinvestRoutes);
app.use("/api/promo-event", promoEventRoutes);
app.use("/api/admin", adminPromoEventRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/webhooks/alchemy", alchemyWebhookRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  startAutomaticDepositScanner();

  console.log("Recolección automática deshabilitada por seguridad. Usa /admin/deposits para enviar gas y recolectar manualmente.");
});
