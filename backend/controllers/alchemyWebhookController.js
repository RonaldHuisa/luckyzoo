const {
  verifyAlchemySignature,
  processAlchemyWebhookPayload,
  syncAlchemyWebhookAddresses,
} = require("../services/alchemyWebhookService");

function getLabel(networkCode) {
  if (networkCode === "BEP20-USDT") return "BSC";
  if (networkCode === "POLYGON-USDT") return "POLYGON";
  return "GENERIC";
}

async function handleDepositWebhook(req, res, networkCode = null) {
  try {
    const signature = verifyAlchemySignature(req, { networkCode });
    if (!signature.ok) {
      console.warn(`ALCHEMY ${getLabel(networkCode)} WEBHOOK SIGNATURE REJECTED:`, signature.reason);
      return res.status(403).json({ ok: false, message: signature.reason });
    }

    const summary = await processAlchemyWebhookPayload(req.body || {}, { expectedNetworkCode: networkCode });
    console.log(`ALCHEMY ${getLabel(networkCode)} WEBHOOK DEPOSITS:`, summary);

    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    console.error(`ALCHEMY ${getLabel(networkCode)} WEBHOOK ERROR:`, error);
    return res.status(500).json({
      ok: false,
      message: error.message || "Error procesando webhook Alchemy",
    });
  }
}

async function receiveDepositWebhook(req, res) {
  return handleDepositWebhook(req, res, null);
}

async function receiveBscDepositWebhook(req, res) {
  return handleDepositWebhook(req, res, "BEP20-USDT");
}

async function receivePolygonDepositWebhook(req, res) {
  return handleDepositWebhook(req, res, "POLYGON-USDT");
}

async function syncAddresses(req, res) {
  try {
    const result = await syncAlchemyWebhookAddresses({ networkCode: req.body?.network || req.query?.network });
    return res.json(result);
  } catch (error) {
    console.error("ALCHEMY SYNC ADDRESSES ERROR:", error);
    return res.status(500).json({ ok: false, message: error.message || "Error sincronizando wallets con Alchemy" });
  }
}

async function syncBscAddresses(req, res) {
  try {
    const result = await syncAlchemyWebhookAddresses({ networkCode: "BEP20-USDT" });
    return res.json(result);
  } catch (error) {
    console.error("ALCHEMY BSC SYNC ADDRESSES ERROR:", error);
    return res.status(500).json({ ok: false, message: error.message || "Error sincronizando wallets BSC con Alchemy" });
  }
}

async function syncPolygonAddresses(req, res) {
  try {
    const result = await syncAlchemyWebhookAddresses({ networkCode: "POLYGON-USDT" });
    return res.json(result);
  } catch (error) {
    console.error("ALCHEMY POLYGON SYNC ADDRESSES ERROR:", error);
    return res.status(500).json({ ok: false, message: error.message || "Error sincronizando wallets Polygon con Alchemy" });
  }
}

module.exports = {
  receiveDepositWebhook,
  receiveBscDepositWebhook,
  receivePolygonDepositWebhook,
  syncAddresses,
  syncBscAddresses,
  syncPolygonAddresses,
};
