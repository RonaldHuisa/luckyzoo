const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const walletRoutes = require("./routes/walletRoutes");
const depositRoutes = require("./routes/depositRoutes");
const withdrawRoutes = require("./routes/withdrawRoutes");
const supportRoutes = require("./routes/supportRoutes");
const referralRoutes = require("./routes/referralRoutes");
const vipRoutes = require("./routes/vipRoutes");
const adminWithdrawRoutes = require("./routes/adminWithdrawRoutes");
const adminPanelRoutes = require("./routes/adminPanelRoutes");
const adminSupportRoutes = require("./routes/adminSupportRoutes");
const { apiRateLimiter } = require("./middleware/rateLimitMiddleware");

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf ? buf.toString("utf8") : ""; } }));
app.use("/uploads/support", express.static(path.join(__dirname, "../uploads/support")));
app.use("/api", apiRateLimiter);

app.get("/", (req, res) => res.json({ message: "Royal Imperial API funcionando.", mode: "minimal-roulette" }));

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/deposits", depositRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/vip", vipRoutes);
app.use("/api/admin/support", adminSupportRoutes);
app.use("/api/admin/panel", adminPanelRoutes);
app.use("/api/admin", adminWithdrawRoutes);

app.use((req, res) => res.status(404).json({ message: "Ruta no encontrada." }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Error interno del servidor." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Royal Imperial API minimal corriendo en puerto ${PORT}`));
