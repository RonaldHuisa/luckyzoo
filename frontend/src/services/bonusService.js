const pool = require('../config/db');
const { isProfileComplete } = require('./profileService');
const { assertNoPlanRewardBalanceCap } = require('./noPlanBalanceCapService');

const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;
// Ventana especial de lanzamiento: domingo 12/07/2026 desde las 12:00 GMT-5
// hasta el reinicio normal del lunes 13/07/2026 a las 00:00 GMT-5.
const SPECIAL_WEEK_DAY_START_UTC = new Date('2026-07-12T05:00:00.000Z');
const SPECIAL_REFERRAL_START_UTC = new Date('2026-07-12T17:00:00.000Z');
const SPECIAL_WEEK_END_UTC = new Date('2026-07-13T05:00:00.000Z');
const PASANTIA_CHECKIN_REWARD = 0.2;
const PASANTIA_MAX_CHECKINS = 5;
const PLAN_MAX_WEEKLY_CHECKINS = 5;
const PASANTIA_TASK_TIERS = [
  { key: 'trial_invite_1', required: 1, rewardUsdt: 1, rewardRoulettePoints: 0 },
  { key: 'trial_invite_3', required: 3, rewardUsdt: 3, rewardRoulettePoints: 0 },
];

const PLAN_CHECKIN_REWARDS = {
  1: 0.1,
  2: 0.2,
  3: 0.3,
  4: 0.5,
  5: 1,
  6: 5,
  7: 10,
  8: 30,
};

const PLAN_TASK_TIERS = [
  { key: 'plan_referral_1', required: 1, rewardUsdt: 1, rewardRoulettePoints: 2 },
  { key: 'plan_referral_3', required: 3, rewardUsdt: 3, rewardRoulettePoints: 3 },
  { key: 'plan_referral_6', required: 6, rewardUsdt: 10, rewardRoulettePoints: 4 },
];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getShiftedPeruDate(date = new Date()) {
  return new Date(date.getTime() - PERU_OFFSET_MS);
}

function shiftedMidnight(date = new Date()) {
  const shifted = getShiftedPeruDate(date);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function formatShiftedDate(date = new Date()) {
  const shifted = getShiftedPeruDate(date);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCheckinDateKey(row) {
  const explicitKey = String(row?.checkin_date_key || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitKey)) return explicitKey;

  const value = row?.checkin_date;
  if (!value) return '';

  if (typeof value === 'string') {
    const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

function getPeruDateParts(date = new Date()) {
  const shifted = getShiftedPeruDate(date);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function getWeekWindow(date = new Date()) {
  const currentMs = date.getTime();

  // El 12 de julio se abre una ventana corta de lanzamiento.
  // El conteo de referidos empieza exactamente a las 12:00 GMT-5 y termina
  // cuando inicia el lunes. Desde ese momento vuelve el ciclo normal semanal.
  if (
    currentMs >= SPECIAL_WEEK_DAY_START_UTC.getTime() &&
    currentMs < SPECIAL_WEEK_END_UTC.getTime()
  ) {
    return {
      startDate: '2026-07-12',
      endDate: '2026-07-12',
      startUtc: new Date(SPECIAL_REFERRAL_START_UTC),
      endUtcExclusive: new Date(SPECIAL_WEEK_END_UTC),
      resetAtUtc: new Date(SPECIAL_WEEK_END_UTC),
      isLaunchPartialWeek: true,
    };
  }

  const shifted = getShiftedPeruDate(date);
  const weekday = shifted.getUTCDay(); // 0 sun, 1 mon
  const diffToMonday = (weekday + 6) % 7;
  const startShifted = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - diffToMonday,
    0, 0, 0, 0,
  ));
  const endShifted = new Date(startShifted.getTime() + (7 * 24 * 60 * 60 * 1000) - 1);
  const nextStartShifted = new Date(startShifted.getTime() + (7 * 24 * 60 * 60 * 1000));

  const startDate = `${startShifted.getUTCFullYear()}-${String(startShifted.getUTCMonth() + 1).padStart(2, '0')}-${String(startShifted.getUTCDate()).padStart(2, '0')}`;
  const endDate = `${endShifted.getUTCFullYear()}-${String(endShifted.getUTCMonth() + 1).padStart(2, '0')}-${String(endShifted.getUTCDate()).padStart(2, '0')}`;

  const startUtc = new Date(startShifted.getTime() + PERU_OFFSET_MS);
  const endUtcExclusive = new Date(nextStartShifted.getTime() + PERU_OFFSET_MS);
  const resetAtUtc = endUtcExclusive;

  return {
    startDate,
    endDate,
    startUtc,
    endUtcExclusive,
    resetAtUtc,
    isLaunchPartialWeek: false,
  };
}

async function ensureBonusSchema(clientOrPool = pool) {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS bonus_checkins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bonus_kind VARCHAR(30) NOT NULL,
      vip_level INTEGER NOT NULL DEFAULT 0,
      checkin_date DATE NOT NULL,
      amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      balance_type VARCHAR(30) NOT NULL DEFAULT 'recharge',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, bonus_kind, checkin_date)
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS bonus_task_claims (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bonus_kind VARCHAR(30) NOT NULL,
      period_key VARCHAR(40) NOT NULL,
      tier_key VARCHAR(50) NOT NULL,
      amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      balance_type VARCHAR(30) NOT NULL DEFAULT 'recharge',
      roulette_points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, bonus_kind, period_key, tier_key)
    )
  `);
}

async function getUserBonusContext(userId, clientOrPool = pool) {
  await ensureBonusSchema(clientOrPool);

  const userResult = await clientOrPool.query(
    `
    SELECT
      id,
      email,
      created_at,
      full_name,
      phone_country_code,
      phone_number,
      COALESCE(withdraw_enabled,false) AS withdraw_enabled,
      COALESCE(roulette_points,0) AS roulette_points
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  const user = userResult.rows[0] || null;
  if (!user) return null;

  const activePurchaseResult = await clientOrPool.query(
    `
    SELECT id, level, price_usdt, purchased_at, expires_at
    FROM vip_purchases
    WHERE user_id = $1
      AND status = 'active'
      AND expires_at > NOW()
      AND level >= 1
    ORDER BY level DESC, expires_at DESC
    LIMIT 1
    `,
    [userId]
  );

  const activePurchase = activePurchaseResult.rows[0] || null;
  const activeLevel = Number(activePurchase?.level || 0);
  const isTrial = activeLevel < 1;
  const registrationPeru = formatShiftedDate(new Date(user.created_at));
  const canUseTrialBonuses = isTrial;

  const accountCountResult = await clientOrPool.query(
    `SELECT COUNT(*)::int AS total FROM user_withdrawal_accounts WHERE user_id = $1`,
    [userId]
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      registrationPeru,
      withdrawEnabled: Boolean(user.withdraw_enabled),
      profileComplete: isProfileComplete(user),
      hasWithdrawalAccount: Number(accountCountResult.rows[0]?.total || 0) > 0,
      roulettePoints: Number(user.roulette_points || 0),
    },
    activePurchase,
    activeLevel,
    isTrial,
    canUseTrialBonuses,
  };
}

async function creditRechargeBalance(client, userId, amount, title, description, referenceType, referenceId, metadata = {}) {
  const requestedAmount = toNumber(amount, 0);
  if (requestedAmount <= 0) return { requestedAmount: 0, creditedAmount: 0, partial: false, message: null };

  const capResult = await assertNoPlanRewardBalanceCap(client, {
    userId,
    balanceType: 'recharge',
    amount: requestedAmount,
  });
  const creditedAmount = Number(capResult.creditedAmount || requestedAmount);

  await client.query(
    `UPDATE users SET balance_usdt = COALESCE(balance_usdt,0) + $1, recharge_balance_usdt = COALESCE(recharge_balance_usdt,0) + $1 WHERE id = $2`,
    [creditedAmount, userId]
  );

  await client.query(
    `
    INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
    VALUES ($1,'recharge','credit','bonus_reward',$2,$3,$4,$5,$6,$7::jsonb,'completed')
    `,
    [userId, title, creditedAmount, description, referenceType, referenceId, JSON.stringify({ ...metadata, requestedAmountUsdt: requestedAmount, creditedAmountUsdt: creditedAmount, partialCredit: Boolean(capResult.partial) })]
  );

  return { ...capResult, requestedAmount, creditedAmount };
}

async function creditWithdrawableBalance(client, userId, amount, title, description, referenceType, referenceId, metadata = {}) {
  const requestedAmount = toNumber(amount, 0);
  if (requestedAmount <= 0) return { requestedAmount: 0, creditedAmount: 0, partial: false, message: null };

  const capResult = await assertNoPlanRewardBalanceCap(client, {
    userId,
    balanceType: 'withdrawable',
    amount: requestedAmount,
  });
  const creditedAmount = Number(capResult.creditedAmount || requestedAmount);

  await client.query(
    `UPDATE users SET withdrawable_usdt = COALESCE(withdrawable_usdt,0) + $1, earnings_balance_usdt = COALESCE(earnings_balance_usdt,0) + $1 WHERE id = $2`,
    [creditedAmount, userId]
  );

  await client.query(
    `
    INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
    VALUES ($1,'withdrawable','credit','bonus_reward',$2,$3,$4,$5,$6,$7::jsonb,'completed')
    `,
    [userId, title, creditedAmount, description, referenceType, referenceId, JSON.stringify({ ...metadata, requestedAmountUsdt: requestedAmount, creditedAmountUsdt: creditedAmount, partialCredit: Boolean(capResult.partial) })]
  );

  return { ...capResult, requestedAmount, creditedAmount };
}

async function addRoulettePoints(client, userId, points) {
  const safePoints = Number(points || 0);
  if (safePoints <= 0) return;
  await client.query(`UPDATE users SET roulette_points = COALESCE(roulette_points,0) + $1 WHERE id = $2`, [safePoints, userId]);
}

async function countQualifiedTrialInvites(userId, clientOrPool = pool) {
  const result = await clientOrPool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM users u
    WHERE u.referred_by_id = $1
      AND COALESCE(u.withdraw_enabled, false) = true
      AND COALESCE(NULLIF(TRIM(u.full_name), ''), '') <> ''
      AND COALESCE(NULLIF(TRIM(u.phone_country_code), ''), '') <> ''
      AND CHAR_LENGTH(COALESCE(TRIM(u.phone_number), '')) >= 6
      AND EXISTS (
        SELECT 1 FROM user_withdrawal_accounts uwa WHERE uwa.user_id = u.id LIMIT 1
      )
    `,
    [userId]
  );
  return Number(result.rows[0]?.total || 0);
}

async function countQualifiedPlanReferralsForWeek(userId, weekWindow, clientOrPool = pool) {
  const result = await clientOrPool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM users u
    WHERE u.referred_by_id = $1
      -- Solo cuenta personas invitadas dentro del periodo semanal vigente.
      -- En la ventana especial del 12/07, empieza a las 12:00 GMT-5.
      AND u.created_at >= ($2::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
      AND u.created_at < ($3::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
      AND COALESCE(u.withdraw_enabled, false) = true
      AND COALESCE(NULLIF(TRIM(u.full_name), ''), '') <> ''
      AND COALESCE(NULLIF(TRIM(u.phone_country_code), ''), '') <> ''
      AND CHAR_LENGTH(COALESCE(TRIM(u.phone_number), '')) >= 6
      AND EXISTS (
        SELECT 1
        FROM user_withdrawal_accounts uwa
        WHERE uwa.user_id = u.id
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1
        FROM vip_purchases vp
        WHERE vp.user_id = u.id
          AND vp.level >= 1
          AND vp.status = 'active'
          AND vp.expires_at > NOW()
        LIMIT 1
      )
    `,
    [userId, weekWindow.startUtc, weekWindow.endUtcExclusive]
  );
  return Number(result.rows[0]?.total || 0);
}

async function getBonusStatus(userId, clientOrPool = pool) {
  await ensureBonusSchema(clientOrPool);
  const context = await getUserBonusContext(userId, clientOrPool);
  if (!context) return null;

  const todayPeru = formatShiftedDate();
  const weekWindow = getWeekWindow();
  const planReward = PLAN_CHECKIN_REWARDS[context.activeLevel] || 0;

  const [checkinsResult, claimResult, qualifiedTrialInvites, qualifiedPlanInvites] = await Promise.all([
    clientOrPool.query(`SELECT bc.*, TO_CHAR(bc.checkin_date, 'YYYY-MM-DD') AS checkin_date_key FROM bonus_checkins bc WHERE bc.user_id = $1 ORDER BY bc.checkin_date ASC, bc.id ASC`, [userId]),
    clientOrPool.query(`SELECT * FROM bonus_task_claims WHERE user_id = $1 ORDER BY created_at DESC, id DESC`, [userId]),
    countQualifiedTrialInvites(userId, clientOrPool),
    countQualifiedPlanReferralsForWeek(userId, weekWindow, clientOrPool),
  ]);

  const allCheckins = checkinsResult.rows || [];
  const allClaims = claimResult.rows || [];

  const trialCheckins = allCheckins.filter((row) => row.bonus_kind === 'trial_checkin');
  const planCheckins = allCheckins.filter((row) => row.bonus_kind === 'plan_checkin');
  const currentWeekPlanCheckins = planCheckins.filter((row) => {
    const date = getCheckinDateKey(row);
    return date >= weekWindow.startDate && date <= weekWindow.endDate;
  });

  const trialTodayDone = trialCheckins.some((row) => getCheckinDateKey(row) === todayPeru);
  const planTodayDone = currentWeekPlanCheckins.some((row) => getCheckinDateKey(row) === todayPeru);

  const trialLifetimeClaims = allClaims.filter((row) => row.bonus_kind === 'trial_tasks');
  const planWeeklyClaims = allClaims.filter((row) => row.bonus_kind === 'plan_tasks' && String(row.period_key) === weekWindow.startDate);

  const trialTaskTiers = PASANTIA_TASK_TIERS.map((tier) => {
    const claimed = trialLifetimeClaims.some((row) => row.tier_key === tier.key);
    return {
      key: tier.key,
      required: tier.required,
      current: qualifiedTrialInvites,
      rewardUsdt: tier.rewardUsdt,
      rewardRoulettePoints: tier.rewardRoulettePoints,
      balanceType: 'recharge',
      claimed,
      canClaim: context.canUseTrialBonuses && qualifiedTrialInvites >= tier.required && !claimed,
    };
  });

  const planTaskTiers = PLAN_TASK_TIERS.map((tier) => {
    const claimed = planWeeklyClaims.some((row) => row.tier_key === tier.key);
    return {
      key: tier.key,
      required: tier.required,
      current: qualifiedPlanInvites,
      rewardUsdt: tier.rewardUsdt,
      rewardRoulettePoints: tier.rewardRoulettePoints,
      balanceType: 'withdrawable',
      claimed,
      canClaim: context.activeLevel >= 1 && qualifiedPlanInvites >= tier.required && !claimed,
    };
  });

  const trialCheckinDays = Array.from({ length: PASANTIA_MAX_CHECKINS }, (_, index) => ({
    day: index + 1,
    done: index < trialCheckins.length,
  }));
  const planCheckinDays = Array.from({ length: PLAN_MAX_WEEKLY_CHECKINS }, (_, index) => ({
    day: index + 1,
    done: index < currentWeekPlanCheckins.length,
  }));

  return {
    user: context.user,
    todayPeru,
    activeLevel: context.activeLevel,
    isTrial: context.isTrial,
    canUseTrialBonuses: context.canUseTrialBonuses,
    checkin: context.activeLevel >= 1 ? {
      kind: 'plan_checkin',
      title: 'Check-in diario',
      rewardUsdt: planReward,
      balanceType: 'withdrawable',
      canClaim: context.activeLevel >= 1 && !planTodayDone && currentWeekPlanCheckins.length < PLAN_MAX_WEEKLY_CHECKINS && planReward > 0,
      claimedToday: planTodayDone,
      todayDone: planTodayDone,
      frequency: 'weekly_5_days',
      resetMode: 'weekly',
      activeLevel: context.activeLevel,
      completedTotal: planCheckins.length,
      completedThisWeek: currentWeekPlanCheckins.length,
      maxDays: PLAN_MAX_WEEKLY_CHECKINS,
      days: planCheckinDays,
      weekStart: weekWindow.startDate,
      weekEnd: weekWindow.endDate,
      message: 'Hasta 5 check-ins por semana.',
      resetAt: weekWindow.resetAtUtc,
    } : {
      kind: 'trial_checkin',
      title: 'Check-in de pasantía',
      rewardUsdt: PASANTIA_CHECKIN_REWARD,
      balanceType: 'recharge',
      canClaim: context.canUseTrialBonuses && !trialTodayDone && trialCheckins.length < PASANTIA_MAX_CHECKINS,
      claimedToday: trialTodayDone,
      todayDone: trialTodayDone,
      frequency: 'lifetime_5_days',
      resetMode: 'none',
      activeLevel: 0,
      completedTotal: trialCheckins.length,
      maxDays: PASANTIA_MAX_CHECKINS,
      days: trialCheckinDays,
      message: 'Disponible por 5 días en total.',
      resetAt: null,
    },
    tasks: context.activeLevel >= 1 ? {
      kind: 'plan_tasks',
      title: 'Tareas semanales',
      balanceType: 'withdrawable',
      weekStart: weekWindow.startDate,
      weekEnd: weekWindow.endDate,
      resetAt: weekWindow.resetAtUtc,
      countedReferrals: qualifiedPlanInvites,
      tiers: planTaskTiers,
      rules: [
        'Solo aplica para usuarios con plan activo R1 o superior.',
        ...(weekWindow.isLaunchPartialWeek
          ? ['Esta semana especial cuenta personas invitadas desde el 12 de julio a las 12:00 GMT-5.']
          : ['El conteo reinicia cada lunes 00:00 GMT-5 y cierra cada domingo 23:59 GMT-5.']),
        'Solo cuentan referidos directos creados dentro del periodo semanal vigente.',
        'Para validar un referido se requiere datos completos, cuenta de retiro, plan activo y habilitación del gerente.',
      ],
    } : {
      kind: 'trial_tasks',
      title: 'Tareas de pasantía',
      balanceType: 'recharge',
      countedReferrals: qualifiedTrialInvites,
      tiers: trialTaskTiers,
      rules: [
        'Disponible únicamente sin nivel o en pasantía.',
        'Se cuentan referidos directos válidos con datos personales completos, cuenta de retiro y habilitación del gerente.',
      ],
    },
  };
}

async function claimCheckin(userId, client) {
  await ensureBonusSchema(client);
  const status = await getBonusStatus(userId, client);
  if (!status) throw new Error('Usuario no encontrado.');
  if (!status.checkin?.canClaim) throw new Error('El check-in no está disponible por ahora.');

  const todayPeru = status.todayPeru;
  const bonusKind = status.checkin.kind;
  const rewardUsdt = toNumber(status.checkin.rewardUsdt, 0);
  const vipLevel = Number(status.activeLevel || 0);

  const insert = await client.query(
    `
    INSERT INTO bonus_checkins(user_id, bonus_kind, vip_level, checkin_date, amount_usdt, balance_type)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (user_id, bonus_kind, checkin_date) DO NOTHING
    RETURNING *
    `,
    [userId, bonusKind, vipLevel, todayPeru, rewardUsdt, status.checkin.balanceType]
  );

  if (!insert.rows.length) throw new Error('El check-in de hoy ya fue registrado.');
  const row = insert.rows[0];

  const creditResult = status.checkin.balanceType === 'withdrawable'
    ? await creditWithdrawableBalance(client, userId, rewardUsdt, 'Check-in diario', 'Bono de asistencia diaria.', 'bonus_checkin', row.id, { bonusKind, vipLevel, checkinDate: todayPeru })
    : await creditRechargeBalance(client, userId, rewardUsdt, 'Check-in pasantía', 'Bono de asistencia de pasantía.', 'bonus_checkin', row.id, { bonusKind, vipLevel, checkinDate: todayPeru });

  if (Number(creditResult.creditedAmount) !== Number(rewardUsdt)) {
    await client.query(`UPDATE bonus_checkins SET amount_usdt = $1 WHERE id = $2`, [creditResult.creditedAmount, row.id]);
    row.amount_usdt = creditResult.creditedAmount;
  }

  return {
    ...row,
    requestedAmountUsdt: rewardUsdt,
    creditedAmountUsdt: creditResult.creditedAmount,
    partialCredit: Boolean(creditResult.partial),
    creditMessage: creditResult.message || null,
  };
}

async function claimTaskTier(userId, tierKey, client) {
  await ensureBonusSchema(client);
  const status = await getBonusStatus(userId, client);
  if (!status) throw new Error('Usuario no encontrado.');

  const taskSection = status.tasks;
  const tier = (taskSection?.tiers || []).find((item) => item.key === tierKey);
  if (!tier) throw new Error('Tarea no encontrada.');
  if (!tier.canClaim) throw new Error('Esta tarea todavía no está disponible.');

  const periodKey = taskSection.kind === 'plan_tasks' ? String(taskSection.weekStart) : 'lifetime';

  const insert = await client.query(
    `
    INSERT INTO bonus_task_claims(user_id, bonus_kind, period_key, tier_key, amount_usdt, balance_type, roulette_points)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (user_id, bonus_kind, period_key, tier_key) DO NOTHING
    RETURNING *
    `,
    [userId, taskSection.kind, periodKey, tier.key, tier.rewardUsdt, tier.balanceType, tier.rewardRoulettePoints]
  );

  if (!insert.rows.length) throw new Error('Esta recompensa ya fue reclamada.');
  const row = insert.rows[0];

  const creditResult = tier.balanceType === 'withdrawable'
    ? await creditWithdrawableBalance(client, userId, tier.rewardUsdt, 'Bono por tarea semanal', 'Recompensa semanal por referidos válidos.', 'bonus_task_claim', row.id, { tierKey: tier.key, periodKey })
    : await creditRechargeBalance(client, userId, tier.rewardUsdt, 'Bono por tarea de pasantía', 'Recompensa por meta de pasantía.', 'bonus_task_claim', row.id, { tierKey: tier.key, periodKey });

  if (Number(creditResult.creditedAmount) !== Number(tier.rewardUsdt)) {
    await client.query(`UPDATE bonus_task_claims SET amount_usdt = $1 WHERE id = $2`, [creditResult.creditedAmount, row.id]);
    row.amount_usdt = creditResult.creditedAmount;
  }

  if (Number(tier.rewardRoulettePoints || 0) > 0) {
    await addRoulettePoints(client, userId, Number(tier.rewardRoulettePoints || 0));
  }

  return {
    ...row,
    requestedAmountUsdt: Number(tier.rewardUsdt || 0),
    creditedAmountUsdt: Number(creditResult.creditedAmount || 0),
    partialCredit: Boolean(creditResult.partial),
    creditMessage: creditResult.message || null,
  };
}

module.exports = {
  ensureBonusSchema,
  getBonusStatus,
  claimCheckin,
  claimTaskTier,
  PASANTIA_MAX_CHECKINS,
  PLAN_CHECKIN_REWARDS,
};
