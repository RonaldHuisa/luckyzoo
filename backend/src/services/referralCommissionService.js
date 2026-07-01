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
  const commissionableLevel = Math.min(purchasedLevel, sponsorMaxLevel);
  if (commissionableLevel < 1) return;

  const commissionPlan = await getCommissionPlan(client, commissionableLevel);
  if (!commissionPlan) return;

  const commissionBaseAmount = Number(commissionPlan.price_usdt || 0);
  if (commissionBaseAmount <= 0) return;

  const percent = referralDepth === 1 ? 8 : 1;

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
    ($1,$2,$3,$4,$5,$6,$7,($6::numeric * $7::numeric / 100))
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
      `${percent}% sobre ${commissionPlan.name}. Nivel comprador: ${purchasedLevel}. Nivel máximo del receptor: ${sponsorMaxLevel}.`,
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
        commissionablePlanName: commissionPlan.name,
        originalBaseAmountUsdt: baseAmountUsdt,
        commissionBaseAmountUsdt: commissionBaseAmount,
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
  // - Nivel 1/directo: 8%.
  // - Nivel 2 e indirecto Nivel 3: 1% cada uno.
  // - Para cobrar, el receptor debe tener al menos un nivel activo o comprado.
  // - Si el referido compra un nivel superior al receptor,
  //   la comisión se calcula solo hasta el nivel máximo comprado por el receptor.

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
