const { ensureGreenVestTreeSchema } = require("./greenVestTreeService");

async function createReferralCommissions(
  client,
  sourceUserId,
  sourceType,
  sourceId,
  baseAmountUsdt,
  options = {}
) {
  // GreenVest Árboles V1.0:
  // - Comisión directa única: 5%.
  // - Nivel 0 / Pasantía no genera comisión.
  // - Si el patrocinador tiene un nivel menor al comprado por el referido,
  //   solo cobra comisión sobre el precio del nivel máximo que él haya comprado.
  await ensureGreenVestTreeSchema(client);

  const sponsorResult = await client.query(
    `SELECT referred_by_id FROM users WHERE id = $1`,
    [sourceUserId]
  );

  if (sponsorResult.rows.length === 0) return;

  const sponsorId = sponsorResult.rows[0].referred_by_id;
  if (!sponsorId) return;

  const purchasedLevel = Number(options.purchasedLevel || 0);
  if (purchasedLevel < 1) return;

  const sponsorLevelResult = await client.query(
    `
    SELECT COALESCE(MAX(level), 0)::int AS max_level
    FROM vip_purchases
    WHERE user_id = $1
      AND level >= 1
      AND status IN ('active', 'expired', 'completed')
    `,
    [sponsorId]
  );

  const sponsorMaxLevel = Number(sponsorLevelResult.rows[0]?.max_level || 0);
  if (sponsorMaxLevel < 1) return;

  const commissionableLevel = Math.min(purchasedLevel, sponsorMaxLevel);

  const planResult = await client.query(
    `SELECT level, name, price_usdt FROM vip_packages WHERE level = $1`,
    [commissionableLevel]
  );

  if (planResult.rows.length === 0) return;

  const commissionPlan = planResult.rows[0];
  const commissionBaseAmount = Number(commissionPlan.price_usdt || 0);
  const percent = 5;

  if (commissionBaseAmount <= 0) return;

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
    ($1,$2,1,$3,$4,$5,$6,($5::numeric * $6::numeric / 100))
    ON CONFLICT (receiver_user_id, source_type, source_id, level)
    DO NOTHING
    RETURNING id, amount_usdt
    `,
    [
      sponsorId,
      sourceUserId,
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
    [commission.amount_usdt, sponsorId]
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
      sponsorId,
      "earnings",
      "credit",
      "referral_commission",
      "Comisión directa GreenVest",
      commission.amount_usdt,
      `Comisión del 5% sobre ${commissionPlan.name}. Nivel comprador: ${purchasedLevel}. Nivel máximo del patrocinador: ${sponsorMaxLevel}.`,
      "referral_commission",
      commission.id,
      JSON.stringify({
        referralDepth: 1,
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

module.exports = {
  createReferralCommissions,
};
