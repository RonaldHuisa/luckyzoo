const express = require("express");
const pool = require("../config/db");
const alchemySyncAuthMiddleware = require("../middleware/alchemySyncAuthMiddleware");
const {
  verifyAlchemySignature,
  processAlchemyWebhookPayload,
  syncAlchemyWebhookAddresses,
} = require("../services/alchemyWebhookService");

const router = express.Router();

function maskSecret(value, visible = 6) {
  const text = String(value || "");
  if (!text) return null;
  if (text.length <= visible * 2) return `${text.slice(0, 3)}...`;
  return `${text.slice(0, visible)}...${text.slice(-visible)}`;
}

function getAlchemyAuthToken() {
  return process.env.ALCHEMY_NOTIFY_AUTH_TOKEN || process.env.ALCHEMY_AUTH_TOKEN || "";
}

function getConfiguredWebhooks() {
  return [
    {
      networkCode: "BEP20-USDT",
      alchemyNetwork: "BNB_MAINNET",
      webhookId: process.env.ALCHEMY_BSC_WEBHOOK_ID || process.env.ALCHEMY_BEP20_WEBHOOK_ID || "",
      signingKey: process.env.ALCHEMY_BSC_WEBHOOK_SIGNING_KEY || process.env.ALCHEMY_BEP20_WEBHOOK_SIGNING_KEY || "",
      endpoint: "/api/webhooks/alchemy/bsc",
    },
    {
      networkCode: "POLYGON-USDT",
      alchemyNetwork: "MATIC_MAINNET",
      webhookId: process.env.ALCHEMY_POLYGON_WEBHOOK_ID || "",
      signingKey: process.env.ALCHEMY_POLYGON_WEBHOOK_SIGNING_KEY || "",
      endpoint: "/api/webhooks/alchemy/polygon",
    },
  ];
}

async function getWalletCounts() {
  const result = await pool.query(`
    SELECT network, COUNT(DISTINCT LOWER(address))::int AS total
    FROM wallets
    WHERE address IS NOT NULL AND address <> ''
    GROUP BY network
    ORDER BY network ASC
  `);

  return result.rows.reduce((map, row) => {
    map[row.network] = Number(row.total || 0);
    return map;
  }, {});
}

async function callAlchemyTeamWebhooks() {
  const token = getAlchemyAuthToken();
  if (!token) {
    return { ok: false, skipped: true, reason: "missing_ALCHEMY_NOTIFY_AUTH_TOKEN" };
  }

  const response = await fetch("https://dashboard.alchemy.com/api/team-webhooks", {
    method: "GET",
    headers: { "X-Alchemy-Token": token },
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }

  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return {
    ok: true,
    total: list.length,
    webhooks: list.map((item) => ({
      id: item.id,
      network: item.network,
      type: item.webhook_type,
      url: item.webhook_url,
      active: item.is_active,
      version: item.version,
      signingKeyPresent: Boolean(item.signing_key),
      signingKeyMasked: maskSecret(item.signing_key),
    })),
  };
}

async function handleAlchemyWebhook(req, res, expectedNetworkCode = null) {
  try {
    const verification = verifyAlchemySignature(req, { networkCode: expectedNetworkCode });
    if (!verification.ok) {
      return res.status(401).json({ ok: false, message: verification.reason || "Firma Alchemy inválida." });
    }

    const summary = await processAlchemyWebhookPayload(req.body, { expectedNetworkCode });
    return res.json({ ok: true, signature: verification.skipped ? "skipped" : "verified", summary });
  } catch (error) {
    console.error("ALCHEMY WEBHOOK ROUTE ERROR:", error);
    return res.status(500).json({ ok: false, message: "Error procesando webhook Alchemy.", detail: error.message });
  }
}

router.get("/health", alchemySyncAuthMiddleware, async (req, res) => {
  try {
    const walletCounts = await getWalletCounts();
    const configured = getConfiguredWebhooks().map((item) => ({
      ...item,
      webhookIdPresent: Boolean(item.webhookId),
      webhookIdMasked: maskSecret(item.webhookId),
      signingKeyPresent: Boolean(item.signingKey),
      signingKeyMasked: maskSecret(item.signingKey),
      trackedWalletsInDb: walletCounts[item.networkCode] || 0,
    }));

    return res.json({
      ok: true,
      authMethod: req.syncAuth?.method || "unknown",
      notifyAuthTokenPresent: Boolean(getAlchemyAuthToken()),
      notifyAuthTokenMasked: maskSecret(getAlchemyAuthToken()),
      syncSecretPresent: Boolean(process.env.ALCHEMY_SYNC_SECRET),
      configured,
      callbackUrls: {
        bsc: `${req.protocol}://${req.get("host")}/api/webhooks/alchemy/bsc`,
        polygon: `${req.protocol}://${req.get("host")}/api/webhooks/alchemy/polygon`,
      },
    });
  } catch (error) {
    console.error("ALCHEMY HEALTH ERROR:", error);
    return res.status(500).json({ ok: false, message: "Error revisando configuración Alchemy.", detail: error.message });
  }
});

router.get("/team-webhooks", alchemySyncAuthMiddleware, async (req, res) => {
  try {
    const data = await callAlchemyTeamWebhooks();
    return res.status(data.ok ? 200 : 400).json(data);
  } catch (error) {
    console.error("ALCHEMY TEAM WEBHOOKS ERROR:", error);
    return res.status(500).json({ ok: false, message: "Error consultando Alchemy team-webhooks.", detail: error.message });
  }
});

router.post("/sync-addresses", alchemySyncAuthMiddleware, async (req, res) => {
  try {
    const networkCode = req.body?.networkCode || req.query.networkCode || null;
    const result = await syncAlchemyWebhookAddresses({ networkCode });
    return res.json({ ok: true, authMethod: req.syncAuth?.method || "unknown", ...result });
  } catch (error) {
    console.error("ALCHEMY SYNC ADDRESSES ERROR:", error);
    return res.status(500).json({ ok: false, message: "Error sincronizando direcciones con Alchemy.", detail: error.message });
  }
});

router.post("/bsc", (req, res) => handleAlchemyWebhook(req, res, "BEP20-USDT"));
router.post("/polygon", (req, res) => handleAlchemyWebhook(req, res, "POLYGON-USDT"));
router.post("/", (req, res) => handleAlchemyWebhook(req, res, null));

module.exports = router;
