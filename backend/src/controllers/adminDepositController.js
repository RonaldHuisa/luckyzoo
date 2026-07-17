const pool = require("../config/db");
const {
  getCollectionStatusForDeposit,
  sendGasForDeposit,
  collectDepositToCentral,
  refreshDepositCollectionStatus,
} = require("../services/sweepService");
const { getPaymentNetwork } = require("../utils/paymentNetworks");

function money(value) {
  return Number(value || 0);
}

function getLimit(value, fallback = 12, max = 100) {
  const n = Number(value || fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function getPage(value) {
  const n = Number(value || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function buildActionState(item) {
  const sweepStatus = item.sweep_status || "pending";
  const hasGasTx = Boolean(item.bnb_topup_tx_hash);
  const hasSweepTx = Boolean(item.sweep_tx_hash);
  const isSwept = sweepStatus === "swept";

  return {
    // Permite reenviar gas si el anterior ya confirmó pero todavía no alcanza.
    // En Polygon el gas puede variar rápido; por eso no bloqueamos el botón solo por existir bnb_topup_tx_hash.
    canSendGas: !isSwept && !hasSweepTx && sweepStatus !== "gas_pending" && sweepStatus !== "collecting",
    // Recolectar solo se habilita cuando el gas ya fue confirmado y validado como suficiente.
    canCollect: !isSwept && !hasSweepTx && sweepStatus === "gas_ready",
    canRefresh: !isSwept && (hasGasTx || hasSweepTx || sweepStatus === "gas_pending" || sweepStatus === "collecting" || sweepStatus === "gas_short"),
  };
}

async function listAdminDeposits(req, res) {
  try {
    const limit = getLimit(req.query.limit, 12, 100);
    const page = getPage(req.query.page);
    const offset = (page - 1) * limit;

    const whereSql = `
      WHERE d.status = 'confirmed'
        AND COALESCE(d.sweep_status, '') NOT IN ('manual', 'hidden_manual')
        AND COALESCE(d.tx_hash, '') NOT LIKE 'manual_admin_recharge_%'
        AND COALESCE(d.token_contract, '') <> 'manual-admin-credit'
    `;

    const [countResult, result] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM deposits d ${whereSql}`),
      pool.query(
      `
      SELECT
        d.id,
        d.user_id,
        u.email,
        d.wallet_id,
        w.address AS wallet_address,
        d.network,
        d.tx_hash,
        d.log_index,
        d.block_number,
        d.amount_usdt,
        d.status,
        d.sweep_status,
        d.bnb_topup_tx_hash,
        d.sweep_tx_hash,
        d.swept_at,
        d.created_at,
        vp.level AS vip_level,
        vp.price_usdt AS vip_price_usdt,
        pkg.name AS vip_name
      FROM deposits d
      JOIN users u ON u.id = d.user_id
      JOIN wallets w ON w.id = d.wallet_id
      LEFT JOIN LATERAL (
        SELECT level, price_usdt, package_id, purchased_at
        FROM vip_purchases
        WHERE user_id = d.user_id
          AND purchased_at >= d.created_at
          AND purchased_at <= d.created_at + INTERVAL '2 hours'
        ORDER BY purchased_at ASC
        LIMIT 1
      ) vp ON true
      LEFT JOIN vip_packages pkg ON pkg.id = vp.package_id
      ${whereSql}
      ORDER BY d.created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    )
    ]);

    const deposits = result.rows.map((item) => {
      let networkInfo = null;
      try {
        const network = getPaymentNetwork(item.network, { deposit: true });
        networkInfo = {
          code: network.code,
          displayName: network.displayName,
          nativeSymbol: network.nativeSymbol,
          asset: network.asset,
        };
      } catch (_) {}

      return {
        ...item,
        amount_usdt: money(item.amount_usdt),
        vip_price_usdt: item.vip_price_usdt ? money(item.vip_price_usdt) : null,
        networkInfo,
        actions: buildActionState(item),
      };
    });

    return res.json({ deposits, pagination: { page, limit, total: Number(countResult.rows[0]?.total || 0) } });
  } catch (error) {
    console.error("LIST ADMIN DEPOSITS ERROR:", error);
    return res.status(500).json({
      message: "Error al cargar depósitos para recolección.",
      detail: error.message,
    });
  }
}

async function getAdminDepositPreview(req, res) {
  try {
    const depositId = Number(req.params.depositId);
    const context = await getCollectionStatusForDeposit(depositId);

    return res.json({
      deposit: {
        id: context.deposit.id,
        userId: context.deposit.user_id,
        email: context.deposit.email,
        network: context.deposit.network,
        amountUsdt: money(context.deposit.amount_usdt),
        walletAddress: context.deposit.address,
        sweepStatus: context.deposit.sweep_status,
        topupTxHash: context.deposit.bnb_topup_tx_hash,
        sweepTxHash: context.deposit.sweep_tx_hash,
      },
      network: {
        code: context.network.code,
        displayName: context.network.displayName,
        nativeSymbol: context.network.nativeSymbol,
        asset: context.network.asset,
      },
      balances: context.balances,
    });
  } catch (error) {
    console.error("ADMIN DEPOSIT PREVIEW ERROR:", error);
    return res.status(400).json({
      message: "No se pudo obtener la vista previa del depósito.",
      detail: error.message,
    });
  }
}

async function sendDepositGas(req, res) {
  try {
    const depositId = Number(req.params.depositId);
    const result = await sendGasForDeposit(depositId);

    return res.json(result);
  } catch (error) {
    console.error("ADMIN SEND GAS ERROR:", error);
    return res.status(400).json({
      message: "No se pudo enviar gas al usuario.",
      detail: error.message,
    });
  }
}

async function collectDeposit(req, res) {
  try {
    const depositId = Number(req.params.depositId);
    const result = await collectDepositToCentral(depositId);

    return res.json(result);
  } catch (error) {
    console.error("ADMIN COLLECT DEPOSIT ERROR:", error);
    return res.status(400).json({
      message: "No se pudo recolectar el depósito.",
      detail: error.message,
    });
  }
}

async function refreshDepositStatus(req, res) {
  try {
    const depositId = Number(req.params.depositId);
    const result = await refreshDepositCollectionStatus(depositId);

    return res.json(result);
  } catch (error) {
    console.error("ADMIN REFRESH DEPOSIT ERROR:", error);
    return res.status(400).json({
      message: "No se pudo actualizar el estado del depósito.",
      detail: error.message,
    });
  }
}

module.exports = {
  listAdminDeposits,
  getAdminDepositPreview,
  sendDepositGas,
  collectDeposit,
  refreshDepositStatus,
};
