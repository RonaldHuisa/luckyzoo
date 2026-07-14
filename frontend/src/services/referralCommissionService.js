const { assertNoPlanRewardBalanceCap, isNoPlanBalanceCapError } = require("./noPlanBalanceCapService");

async function getUserSponsorId(client, userId) {
  const result = await client.query(
    `SELECT referred_by_id FROM users WHERE id = $1`,
    [userId]
  );

  return result.rows[0]?.referred_by_id || null;
}

async function getSponsorMaxLevel(client, sponsorId) {
  const result = await client.query(
    `
    SELECT COALESCE(MAX(level), 0)::int AS max_level
    FROM vip_purchases
    WHERE user_id = $1
      AND level >= 1
      AND status IN ('active', 'expired', 'completed')
    `,
    [sponsorId]
  );

  return Number(result.rows[0]?.max_level || 0);
}

async function getCommissionPlan(client, level) {
  const result = await client.query(
    `SELECT level, name, price_usdt FROM vip_packages WHERE level = $1`,
    [level]
  );

  return result.rows[0] || null;
}

async function getUserPreviousMaxLevelBeforePurchase(client, userId, currentPurchaseId) {
  const params = [userId];

  let excludeCurrentPurchaseSql = "";

  if (currentPurchaseId) {
    params.push(currentPurchaseId);
    excludeCurrentPurchaseSql = `AND id <> $${params.length}`;
  }

  const result = await client.query(
    `
    SELECT COALESCE(MAX(level), 0)::int AS previous_max_level
    FROM vip_purchases
    WHERE user_id = $1
      ${excludeCurrentPurchaseSql}
      AND level >= 1
      AND status IN ('active', 'expired', 'completed', 'cancelled')
    `,
    params
  );

  return Number(result.rows[0]?.previous_max_level || 0);
}

async function calculateIncrementalCommissionBase({
  client,
  sourceUserId,
  sourceId,
  purchasedLevel,
  sponsorMaxLevel,
}) {
  const commissionableLevel = Math.min(
    Number(purchasedLevel || 0),
    Number(sponsorMaxLevel || 0)
  );

  if (commissionableLevel < 1) {
    return {
      commissionableLevel: 0,
      commissionBaseAmount: 0,
      previousMaxLevel: 0,
      previousCommissionableLevel: 0,
      commissionablePlan: null,
    };
  }

  const previousMaxLevel = await getUserPreviousMaxLevelBeforePurchase(
    client,
    sourceUserId,
    sourceId
  );

  const previousCommissionableLevel = Math.min(
    previousMaxLevel,
    commissionableLevel
  );

  if (previousCommissionableLevel >= commissionableLevel) {
    return {
      commissionableLevel,
      commissionBaseAmount: 0,
      previousMaxLevel,
      previousCommissionableLevel,
      commissionablePlan: null,
    };
  }

  const commissionablePlan = await getCommissionPlan(client, commissionableLevel);
  if (!commissionablePlan) {
    return {
      commissionableLevel,
      commissionBaseAmount: 0,
      previousMaxLevel,
      previousCommissionableLevel,
      commissionablePlan: null,
    };
  }

  let previousPlanPrice = 0;

  if (previousCommissionableLevel >= 1) {
    const previousPlan = await getCommissionPlan(
      client,
      previousCommissionableLevel
    );

    previousPlanPrice = Number(previousPlan?.price_usdt || 0);
  }

  const newPlanPrice = Number(commissionablePlan.price_usdt || 0);
  const commissionBaseAmount = Math.max(0, newPlanPrice - previousPlanPrice);

  return {
    commissionableLevel,
    commissionBaseAmount,
    previousMaxLevel,
    previousCommissionableLevel,
    commissionablePlan,
  };
}

async function createSingleReferralCommission({
  client,
  receiverUserId,
  sourceUserId,
  sourceType,
  sourceId,
  referralDepth,
  purchasedLevel,
  sponsorMaxLevel,
  baseAmountUsdt,
}) {
  const {
    commissionableLevel,
    commissionBaseAmount,
    previousMaxLevel,
    previousCommissionableLevel,
    commissionablePlan,
  } = await calculateIncrementalCommissionBase({
    client,
    sourceUserId,
    sourceId,
    purchasedLevel,
    sponsorMaxLevel,
  });

  if (commissionableLevel < 1) return;
  if (!commissionablePlan) return;

  // Si el usuario vuelve a comprar el mismo plan, compra uno menor,
  // o el receptor ya cobró comisión por ese valor anteriormente,
  // no se genera una comisión duplicada.
  if (commissionBaseAmount <= 0) {
    console.log("REFERRAL COMMISSION SKIPPED", {
      reason: "NO_INCREMENTAL_PLAN_VALUE",
      receiverUserId,
      sourceUserId,
      sourceType,
      sourceId,
      purchasedLevel,
      sponsorMaxLevel,
      previousMaxLevel,
      previousCommissionableLevel,
      commissionableLevel,
    });

    return;
  }

  const percent = referralDepth === 1 ? 7 : referralDepth === 2 ? 2 : 1;
  const requestedCommissionAmount = Number(((Number(commissionBaseAmount || 0) * Number(percent || 0)) / 100).toFixed(8));

  let capResult;
  try {
    capResult = await assertNoPlanRewardBalanceCap(client, {
      userId: receiverUserId,
      balanceType: "withdrawable",
      amount: requestedCommissionAmount,
    });
  } catch (error) {
    if (isNoPlanBalanceCapError(error)) {
      await client.query(
        `
        INSERT INTO referral_commissions
        (receiver_user_id, source_user_id, level, source_type, source_id, base_amount_usdt, percent, amount_usdt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,0)
        ON CONFLICT (receiver_user_id, source_type, source_id, level) DO NOTHING
        `,
        [receiverUserId, sourceUserId, referralDepth, sourceType, sourceId, commissionBaseAmount, percent]
      );
      console.log("REFERRAL COMMISSION SKIPPED", {
        reason: "NO_PLAN_WITHDRAWABLE_CAP_REACHED",
        receiverUserId,
        sourceUserId,
        sourceType,
        sourceId,
        requestedCommissionAmount,
      });
      return;
    }
    throw error;
  }

  const creditedCommissionAmount = Number(capResult.creditedAmount || requestedCommissionAmount);

  const commissionResult = await client.query(
    `
    INSERT INTO referral_commissions
    (
      receiver_user_id,
      source_user_id,
      level,
      source_type,
      source_id,
      base_amount_usdt,
      percent,
      amount_usdt
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (receiver_user_id, source_type, source_id, level)
    DO NOTHING
    RETURNING id, amount_usdt
    `,
    [
      receiverUserId,
      sourceUserId,
      referralDepth,
      sourceType,
      sourceId,
      commissionBaseAmount,
      percent,
      creditedCommissionAmount,
    ]
  );

  if (commissionResult.rows.length === 0) return;

  const commission = commissionResult.rows[0];

  await client.query(
    `
    UPDATE users
    SET withdrawable_usdt = COALESCE(withdrawable_usdt, 0) + $1,
        earnings_balance_usdt = COALESCE(earnings_balance_usdt, 0) + $1
    WHERE id = $2
    `,
    [commission.amount_usdt, receiverUserId]
  );

  await client.query(
    `
    INSERT INTO account_ledger
    (
      user_id,
      balance_type,
      direction,
      type,
      title,
      amount_usdt,
      description,
      reference_type,
      reference_id,
      metadata,
      status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
    ON CONFLICT DO NOTHING
    `,
    [
      receiverUserId,
      "earnings",
      "credit",
      "referral_commission",
      referralDepth === 1 ? "Comisión directa Royal Imperial" : `Comisión indirecta Nivel ${referralDepth} Royal Imperial`,
      commission.amount_usdt,
      `${percent}% sobre valor incremental de ${commissionablePlan.name}. Base comisionable: ${commissionBaseAmount} USDT. Nivel comprador: ${purchasedLevel}. Nivel máximo del receptor: ${sponsorMaxLevel}. Nivel anterior comprador: ${previousMaxLevel}.`,
      "referral_commission",
      commission.id,
      JSON.stringify({
        referralDepth,
        sourceUserId,
        sourceType,
        sourceId,
        percent,
        purchasedLevel,
        sponsorMaxLevel,
        commissionableLevel,
        commissionablePlanName: commissionablePlan.name,
        previousMaxLevel,
        previousCommissionableLevel,
        originalBaseAmountUsdt: baseAmountUsdt,
        commissionBaseAmountUsdt: commissionBaseAmount,
        requestedCommissionAmountUsdt: requestedCommissionAmount,
        creditedCommissionAmountUsdt: creditedCommissionAmount,
        partialCredit: Boolean(capResult.partial),
      }),
      "completed",
    ]
  );
}

async function createReferralCommissions(
  client,
  sourceUserId,
  sourceType,
  sourceId,
  baseAmountUsdt,
  options = {}
) {
  // Royal Imperial comisiones:
  // - Nivel 1/directo: 7%.
  // - Nivel 2: 2%.
  // - Nivel 3: 1%.
  // - Para cobrar, el receptor debe tener al menos un nivel R1 o superior comprado.
  // - Si el referido compra un nivel superior al receptor,
  //   la comisión se calcula solo hasta el nivel máximo comprado por el receptor.
  // - Si el referido sube de rango, la comisión se calcula solo sobre
  //   la diferencia entre el nuevo plan comisionable y su mayor plan anterior.
  //   Ejemplo: R1 -> R2 = 80 - 30 = 50 USDT de base comisionable.
  // - Recompras del mismo nivel o compras menores no generan nueva comisión.

  const purchasedLevel = Number(options.purchasedLevel || 0);
  if (purchasedLevel < 1) return;

  let currentSourceUserId = sourceUserId;

  for (let depth = 1; depth <= 3; depth += 1) {
    const receiverUserId = await getUserSponsorId(client, currentSourceUserId);

    if (!receiverUserId) break;

    const sponsorMaxLevel = await getSponsorMaxLevel(client, receiverUserId);

    if (sponsorMaxLevel >= 1) {
      await createSingleReferralCommission({
        client,
        receiverUserId,
        sourceUserId,
        sourceType,
        sourceId,
        referralDepth: depth,
        purchasedLevel,
        sponsorMaxLevel,
        baseAmountUsdt,
      });
    }

    currentSourceUserId = receiverUserId;
  }
}

module.exports = {
  createReferralCommissions,
};
