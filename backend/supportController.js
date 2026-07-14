const pool = require("../config/db");
const { scanWalletNetwork, ensurePendingScanSchema, markOrCreatePendingScanRequest } = require("../services/depositScannerService");
const { getPaymentNetwork, listPaymentNetworks } = require("../utils/paymentNetworks");
const { ensureNotBanned, logSecurityEvent } = require("../services/securityService");

function getCooldownSeconds() {
  return Number(process.env.DEPOSIT_SCAN_COOLDOWN_SECONDS || 60);
}

function getPendingWindowMinutes() {
  return Number(process.env.DEPOSIT_PENDING_WINDOW_MINUTES || 30);
}

async function getLastScanRequest(userId, networkCode) {
  const client = await pool.connect();
  try {
    await ensurePendingScanSchema(client);
    const result = await client.query(
      `
      SELECT requested_at
      FROM deposit_scan_requests
      WHERE user_id = $1 AND network = $2
      ORDER BY requested_at DESC
      LIMIT 1
      `,
      [userId, networkCode]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

function isCreditedResult(result) {
  return (
    Number(result?.creditedAmount || 0) > 0 ||
    Number(result?.addedDeposits || 0) > 0 ||
    Number(result?.addedAmount || 0) > 0 ||
    Number(result?.repairedDeposits || 0) > 0 ||
    Number(result?.reconciledCreditAmount || 0) > 0
  );
}

async function scanMyDeposits(req, res) {
  const userId = req.user.userId;

  try {
    const restriction = await ensureNotBanned(pool, userId, "verificar recargas");
    if (!restriction.ok) {
      await logSecurityEvent(pool, {
        userId,
        eventType: "DEPOSIT_SCAN_BLOCKED_BANNED",
        reason: restriction.message,
      });
      return res.status(restriction.statusCode || 403).json({
        message: restriction.message,
        userSecurity: restriction.userSecurity,
      });
    }

    const network = getPaymentNetwork(req.body?.network || req.query?.network || "BEP20-USDT", {
      deposit: true,
    });

    const cooldownSeconds = getCooldownSeconds();
    const lastRequest = await getLastScanRequest(userId, network.code);

    if (lastRequest?.requested_at && cooldownSeconds > 0) {
      const elapsedMs = Date.now() - new Date(lastRequest.requested_at).getTime();
      const remainingSeconds = Math.ceil(cooldownSeconds - elapsedMs / 1000);

      if (remainingSeconds > 0) {
        return res.status(429).json({
          message: `Éxito. Tu recarga quedó en verificación. Si el monto no se refleja en 3 a 5 minutos, intenta nuevamente o contacta soporte.`,
          cooldownSeconds: remainingSeconds,
          pendingVerification: true,
        });
      }
    }

    const walletResult = await pool.query(
      `
      SELECT id, user_id, network, address, public_key, created_at, last_scanned_block
      FROM wallets
      WHERE user_id = $1
        AND network = $2
        AND address IS NOT NULL
      ORDER BY id ASC
      LIMIT 1
      `,
      [userId, network.code]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({
        message: "No se encontró wallet de depósito para este usuario.",
      });
    }

    const wallet = walletResult.rows[0];
    console.log(`SCAN REQUEST user=${userId} network=${network.code} wallet=${wallet.address}`);

    // 1) Creamos/actualizamos una solicitud pendiente. Esto permite que el job automático
    //    revise SOLO esta wallet durante la ventana configurada, sin escanear todas las wallets.
    const request = await markOrCreatePendingScanRequest({
      userId,
      walletId: wallet.id,
      networkCode: network.code,
      walletAddress: wallet.address,
      windowMinutes: getPendingWindowMinutes(),
      source: "button",
    });

    // 2) Hacemos una sola consulta inmediata a Moralis. No hay reintentos aquí.
    const result = await scanWalletNetwork(wallet, network.code);

    const credited = isCreditedResult(result);
    const detectedTransfers = Number(result.detectedTransfers || 0);

    // IMPORTANTE:
    // detectedTransfers significa “Moralis vio transferencias históricas”.
    // NO significa “recarga nueva acreditada”.
    // Si no hubo crédito nuevo/reparado, la solicitud debe seguir PENDING para que
    // el scanner automático la revise cada 5 minutos hasta que aparezca una TX nueva
    // o hasta que expire la ventana de verificación.
    const alreadyProcessed = false;

    // 3) Actualizamos la solicitud. Si no acreditó nada, queda pending para el job cada 5 min.
    const client = await pool.connect();
    try {
      await ensurePendingScanSchema(client);
      await client.query(
        `
        UPDATE deposit_scan_requests
        SET
          status = CASE WHEN $3::boolean THEN 'completed' ELSE status END,
          attempts = COALESCE(attempts, 0) + 1,
          added_deposits = COALESCE(added_deposits, 0) + $4,
          detected_transfers = $5,
          last_checked_at = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE completed_at END,
          last_error = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb
        WHERE id = $1 AND user_id = $2
        `,
        [
          request.id,
          userId,
          credited,
          Number(result.addedDeposits || 0),
          detectedTransfers,
          JSON.stringify({
            lastScan: new Date().toISOString(),
            credited,
            alreadyProcessed: false,
            pendingVerification: !credited,
            result: {
              creditedAmount: result.creditedAmount || "0",
              addedAmount: result.addedAmount || "0",
              repairedDeposits: result.repairedDeposits || 0,
              reconciledCreditAmount: result.reconciledCreditAmount || "0",
            },
          }),
        ]
      );
    } finally {
      client.release();
    }

    if (result.status !== "ok") {
      const isRateLimit = String(result.detail || "").toLowerCase().includes("limit") ||
        String(result.detail || "").toLowerCase().includes("rate") ||
        String(result.detail || "").toLowerCase().includes("cu") ||
        String(result.detail || "").toLowerCase().includes("budget");

      return res.status(isRateLimit ? 429 : 500).json({
        message: result.detail || "No se pudo verificar la recarga en este momento.",
        result,
      });
    }

    const message = credited
      ? "Recarga detectada y acreditada correctamente."
      : "Recarga en verificación. Si ya enviaste USDT, la red puede tardar de 1 a 5 minutos. No necesitas presionar nuevamente.";

    return res.json({
      message,
      automatic: false,
      pendingVerification: !credited,
      pendingRequestId: request.id,
      pendingStatus: credited ? "completed" : "pending",
      provider: Array.isArray(result.providersUsed) ? result.providersUsed.join("+") : "moralis",
      network: network.code,
      addedDeposits: Number(result.addedDeposits || 0),
      detectedTransfers,
      credited,
      alreadyProcessed: false,
      addedAmount: result.addedAmount || "0.0",
      creditedAmount: result.creditedAmount || "0.0",
      repairedDeposits: Number(result.repairedDeposits || 0),
      reconciledCreditAmount: result.reconciledCreditAmount || "0",
      reconciledDepositTotal: result.reconciledDepositTotal || "0",
      currentBalanceUsdt: result.currentBalanceUsdt || "0",
      currentRechargeBalanceUsdt: result.currentRechargeBalanceUsdt || "0",
      supportedNetworks: listPaymentNetworks().filter((item) => item.depositEnabled),
    });
  } catch (error) {
    console.error("SCAN MY DEPOSITS ERROR:", error);

    return res.status(500).json({
      message: error.message || "Error al verificar recarga.",
    });
  }
}

module.exports = {
  scanMyDeposits,
};
