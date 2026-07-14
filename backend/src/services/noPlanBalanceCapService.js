const {
  ensureRedeemCodeLimitSchema,
  getRedeemDailyLimitConfig,
  getActivePlanLevel,
  DEFAULT_CONFIG,
} = require('./redeemCodeLimitService');

const NO_PLAN_BALANCE_CAP_ERROR = 'NO_PLAN_BALANCE_CAP';
const EPSILON = 0.00000001;

function toSafeAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(8));
}

function getBalanceName(balanceType) {
  return balanceType === 'withdrawable' ? 'saldo retirable' : 'saldo garantía';
}

function buildNoPlanBalanceCapMessage(balanceType, capUsdt) {
  const cap = Number(capUsdt || 5).toFixed(2).replace('.00', '');
  return `Superaste el límite de ${getBalanceName(balanceType)} de ${cap} USDT. Activa un plan para seguir recibiendo recompensas.`;
}

function buildNoPlanPartialCreditMessage(balanceType, creditedAmount, capUsdt) {
  const credited = Number(creditedAmount || 0).toFixed(2);
  const cap = Number(capUsdt || 5).toFixed(2).replace('.00', '');
  return `Se acreditaron ${credited} USDT para completar el límite de ${getBalanceName(balanceType)} de ${cap} USDT.`;
}

function isNoPlanBalanceCapError(error) {
  return String(error?.code || '') === NO_PLAN_BALANCE_CAP_ERROR;
}

/**
 * Resuelve cuánto de una recompensa puede acreditarse sin superar el tope.
 *
 * - Con plan activo o tope desactivado: acredita el monto completo.
 * - Sin plan y con espacio disponible: acredita hasta completar exactamente el tope.
 * - Si el saldo ya alcanzó el tope: lanza NO_PLAN_BALANCE_CAP.
 */
async function assertNoPlanRewardBalanceCap(client, {
  userId,
  balanceType,
  amount,
}) {
  const requestedAmount = roundAmount(toSafeAmount(amount));
  if (requestedAmount <= 0) {
    return {
      applied: false,
      activeLevel: null,
      requestedAmount,
      creditedAmount: 0,
      partial: false,
      reachedCap: false,
      message: null,
    };
  }

  await ensureRedeemCodeLimitSchema();

  const activeLevel = await getActivePlanLevel(client, userId);
  if (activeLevel >= 1) {
    return {
      applied: false,
      activeLevel,
      requestedAmount,
      creditedAmount: requestedAmount,
      partial: false,
      reachedCap: false,
      message: null,
    };
  }

  const config = await getRedeemDailyLimitConfig(client);
  const isWithdrawable = balanceType === 'withdrawable';
  const normalizedBalanceType = isWithdrawable ? 'withdrawable' : 'recharge';
  const isCapActive = isWithdrawable
    ? config.noPlanWithdrawableCapActive
    : config.noPlanGuaranteeCapActive;

  if (!isCapActive) {
    return {
      applied: false,
      activeLevel,
      requestedAmount,
      creditedAmount: requestedAmount,
      partial: false,
      reachedCap: false,
      message: null,
    };
  }

  const capUsdt = roundAmount(Number(
    isWithdrawable
      ? config.noPlanWithdrawableCapUsdt || DEFAULT_CONFIG.noPlanWithdrawableCapUsdt
      : config.noPlanGuaranteeCapUsdt || DEFAULT_CONFIG.noPlanGuaranteeCapUsdt
  ));

  const balanceResult = await client.query(
    `
    SELECT
      COALESCE(recharge_balance_usdt,0)::numeric AS guarantee_balance,
      COALESCE(withdrawable_usdt,0)::numeric AS withdrawable_balance
    FROM users
    WHERE id = $1
    FOR UPDATE
    `,
    [userId]
  );

  if (!balanceResult.rows.length) {
    const error = new Error('Usuario no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const currentBalance = roundAmount(Number(
    isWithdrawable
      ? balanceResult.rows[0].withdrawable_balance || 0
      : balanceResult.rows[0].guarantee_balance || 0
  ));

  const remainingCapacity = roundAmount(Math.max(0, capUsdt - currentBalance));

  if (remainingCapacity <= EPSILON) {
    const error = new Error(buildNoPlanBalanceCapMessage(balanceType, capUsdt));
    error.code = NO_PLAN_BALANCE_CAP_ERROR;
    error.statusCode = 400;
    error.balanceType = normalizedBalanceType;
    error.capUsdt = capUsdt;
    error.currentBalance = currentBalance;
    error.requestedAmount = requestedAmount;
    error.creditedAmount = 0;
    throw error;
  }

  const creditedAmount = roundAmount(Math.min(requestedAmount, remainingCapacity));
  const partial = creditedAmount + EPSILON < requestedAmount;
  const resultingBalance = roundAmount(currentBalance + creditedAmount);
  const reachedCap = resultingBalance + EPSILON >= capUsdt;

  return {
    applied: true,
    activeLevel,
    balanceType: normalizedBalanceType,
    capUsdt,
    currentBalance,
    remainingCapacity,
    requestedAmount,
    creditedAmount,
    partial,
    reachedCap,
    resultingBalance,
    message: partial
      ? buildNoPlanPartialCreditMessage(balanceType, creditedAmount, capUsdt)
      : null,
  };
}

module.exports = {
  NO_PLAN_BALANCE_CAP_ERROR,
  buildNoPlanBalanceCapMessage,
  buildNoPlanPartialCreditMessage,
  isNoPlanBalanceCapError,
  assertNoPlanRewardBalanceCap,
};
