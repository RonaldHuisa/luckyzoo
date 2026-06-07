const express = require("express");
const alchemySyncAuthMiddleware = require("../middleware/alchemySyncAuthMiddleware");
const {
  receiveDepositWebhook,
  receiveBscDepositWebhook,
  receivePolygonDepositWebhook,
  syncAddresses,
  syncBscAddresses,
  syncPolygonAddresses,
} = require("../controllers/alchemyWebhookController");

const router = express.Router();

// =========================================================
// WEBHOOKS SEPARADOS POR RED - RECOMENDADO PARA PRODUCCIÓN
// =========================================================
// BSC / BEP20-USDT:
// https://api.yunxhi.vip/api/webhooks/alchemy/bsc/deposits
router.post("/bsc/deposits", receiveBscDepositWebhook);

// POLYGON-USDT:
// https://api.yunxhi.vip/api/webhooks/alchemy/polygon/deposits
router.post("/polygon/deposits", receivePolygonDepositWebhook);

// =========================================================
// RUTA LEGACY / COMPATIBILIDAD
// Puedes dejarla, pero para producción usa las rutas separadas.
// https://api.yunxhi.vip/api/webhooks/alchemy/deposits
// =========================================================
router.post("/deposits", receiveDepositWebhook);

// =========================================================
// SYNC DE WALLETS A ALCHEMY
// =========================================================
router.post("/sync-addresses", alchemySyncAuthMiddleware, syncAddresses);
router.post("/bsc/sync-addresses", alchemySyncAuthMiddleware, syncBscAddresses);
router.post("/polygon/sync-addresses", alchemySyncAuthMiddleware, syncPolygonAddresses);

module.exports = router;
