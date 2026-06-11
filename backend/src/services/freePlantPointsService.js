const pool = require("../config/db");
const { ensureGreenVestTreeSchema } = require("./greenVestTreeService");

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizePoints(value) {
  const n = Math.floor(Number(value || 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function ensureFreePlantPointsSchema(clientOrPool = pool) {
  await ensureGreenVestTreeSchema(clientOrPool);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS free_plant_point_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id INTEGER,
      points INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS free_plant_point_events_unique_source
    ON free_plant_point_events(user_id, source_type, source_id)
    WHERE source_id IS NOT NULL
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS free_plant_point_events_user_idx
    ON free_plant_point_events(user_id, created_at DESC)
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS free_plant_redemptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_id INTEGER NOT NULL REFERENCES vip_packages(id),
      level INTEGER NOT NULL,
      points_cost INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP WITHOUT TIME ZONE,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      vip_purchase_id INTEGER REFERENCES vip_purchases(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb
    )
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS free_plant_redemptions_user_idx
    ON free_plant_redemptions(user_id, status, requested_at DESC)
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS free_plant_redemptions_status_idx
    ON free_plant_redemptions(status, requested_at DESC)
  `);
}

async function syncDirectInvitePoints(clientOrPool, userId) {
  await ensureFreePlantPointsSchema(clientOrPool);

  await clientOrPool.query(
    `
    WITH sponsor AS (
      SELECT id, register_ip
      FROM users
      WHERE id = $1
    ),
    direct_invites AS (
      SELECT
        invited.id,
        invited.email,
        invited.register_ip,
        ROW_NUMBER() OVER (PARTITION BY invited.register_ip ORDER BY invited.created_at ASC, invited.id ASC) AS ip_rank
      FROM users invited
      JOIN sponsor s ON invited.referred_by_id = s.id
      WHERE invited.register_ip IS NOT NULL
        AND invited.register_ip <> ''
        AND (s.register_ip IS NULL OR invited.register_ip <> s.register_ip)
    ),
    valid_invites AS (
      SELECT id, email, register_ip
      FROM direct_invites
      WHERE ip_rank = 1
    )
    INSERT INTO free_plant_point_events
      (user_id, source_user_id, source_type, source_id, points, description, metadata)
    SELECT
      $1,
      vi.id,
      'direct_invite',
      vi.id,
      1,
      'Invitado válido registrado con IP única',
      jsonb_build_object('email', vi.email, 'register_ip', vi.register_ip)
    FROM valid_invites vi
    ON CONFLICT (user_id, source_type, source_id)
    WHERE source_id IS NOT NULL
    DO NOTHING
    `,
    [userId]
  );
}

async function isValidDirectInviteForPoints(clientOrPool, sponsorId, invitedUserId) {
  const result = await clientOrPool.query(
    `
    WITH sponsor AS (
      SELECT id, register_ip
      FROM users
      WHERE id = $1
    ),
    invited AS (
      SELECT id, referred_by_id, register_ip
      FROM users
      WHERE id = $2
    ),
    same_ip_directs AS (
      SELECT COUNT(*)::int AS total
      FROM users u
      JOIN invited i ON u.referred_by_id = $1
      WHERE u.register_ip = i.register_ip
        AND u.register_ip IS NOT NULL
        AND u.register_ip <> ''
    )
    SELECT
      CASE
        WHEN i.id IS NULL THEN false
        WHEN i.referred_by_id <> $1 THEN false
        WHEN i.register_ip IS NULL OR i.register_ip = '' THEN false
        WHEN s.register_ip IS NOT NULL AND i.register_ip = s.register_ip THEN false
        WHEN sid.total > 1 THEN false
        ELSE true
      END AS valid
    FROM sponsor s
    CROSS JOIN invited i
    CROSS JOIN same_ip_directs sid
    `,
    [sponsorId, invitedUserId]
  );

  return Boolean(result.rows[0]?.valid);
}

async function createFreePlantPurchasePoints(clientOrPool, buyerUserId, vipPurchaseId, purchasedLevel) {
  await ensureFreePlantPointsSchema(clientOrPool);

  const level = Number(purchasedLevel || 0);
  if (!Number.isInteger(level) || level < 1) return { awarded: false, reason: "invalid_level" };

  const sponsorResult = await clientOrPool.query(
    `SELECT referred_by_id FROM users WHERE id = $1`,
    [buyerUserId]
  );

  const sponsorId = sponsorResult.rows[0]?.referred_by_id;
  if (!sponsorId) return { awarded: false, reason: "no_sponsor" };

  await syncDirectInvitePoints(clientOrPool, sponsorId);

  const validInvite = await isValidDirectInviteForPoints(clientOrPool, sponsorId, buyerUserId);
  if (!validInvite) return { awarded: false, reason: "invalid_invite_ip" };

  const points = 2;

  const insertResult = await clientOrPool.query(
    `
    INSERT INTO free_plant_point_events
      (user_id, source_user_id, source_type, source_id, points, description, metadata)
    VALUES
      ($1, $2, 'tree_purchase', $3, $4, $5, $6::jsonb)
    ON CONFLICT (user_id, source_type, source_id)
    WHERE source_id IS NOT NULL
    DO NOTHING
    RETURNING id, points
    `,
    [
      sponsorId,
      buyerUserId,
      vipPurchaseId,
      points,
      `Invitado directo realizó una inversión GreenVest`,
      JSON.stringify({ purchasedLevel: level, vipPurchaseId, rule: "fixed_2_points_per_investment" }),
    ]
  );

  return {
    awarded: insertResult.rows.length > 0,
    sponsorId,
    points,
  };
}

async function getPointsSummary(clientOrPool, userId) {
  await syncDirectInvitePoints(clientOrPool, userId);

  const result = await clientOrPool.query(
    `
    WITH earned AS (
      SELECT
        COALESCE(SUM(points), 0)::int AS total_points,
        COALESCE(SUM(points) FILTER (WHERE source_type = 'direct_invite'), 0)::int AS invite_points,
        COALESCE(SUM(points) FILTER (WHERE source_type = 'tree_purchase'), 0)::int AS purchase_points,
        COUNT(*) FILTER (WHERE source_type = 'direct_invite')::int AS valid_invites,
        COUNT(*) FILTER (WHERE source_type = 'tree_purchase')::int AS investment_events
      FROM free_plant_point_events
      WHERE user_id = $1
    ),
    reserved AS (
      SELECT COALESCE(SUM(points_cost), 0)::int AS used_points
      FROM free_plant_redemptions
      WHERE user_id = $1
        AND status IN ('pending','approved')
    )
    SELECT
      e.total_points,
      e.invite_points,
      e.purchase_points,
      e.valid_invites,
      e.investment_events,
      COALESCE(r.used_points, 0)::int AS used_points,
      GREATEST(e.total_points - COALESCE(r.used_points, 0), 0)::int AS available_points
    FROM earned e, reserved r
    `,
    [userId]
  );

  const row = result.rows[0] || {};
  return {
    totalPoints: Number(row.total_points || 0),
    invitePoints: Number(row.invite_points || 0),
    purchasePoints: Number(row.purchase_points || 0),
    validInvites: Number(row.valid_invites || 0),
    investmentEvents: Number(row.investment_events || 0),
    usedPoints: Number(row.used_points || 0),
    availablePoints: Number(row.available_points || 0),
  };
}

function getPackagePointsCost(pkg) {
  return Math.ceil(toNumber(pkg.price_usdt));
}

async function getPackagesForPoints(clientOrPool, userId) {
  await ensureFreePlantPointsSchema(clientOrPool);

  const packagesResult = await clientOrPool.query(
    `
    SELECT id, level, name, price_usdt, daily_income_usdt, valid_days, is_purchasable,
           COALESCE(task_reward_usdt, daily_income_usdt / 4) AS task_reward_usdt
    FROM vip_packages
    WHERE level >= 1
      AND is_purchasable = true
    ORDER BY level ASC
    `
  );

  const redemptionsResult = await clientOrPool.query(
    `
    SELECT DISTINCT ON (package_id)
      id, package_id, level, status, points_cost, requested_at, reviewed_at, admin_note
    FROM free_plant_redemptions
    WHERE user_id = $1
      AND status IN ('pending','approved')
    ORDER BY package_id, requested_at DESC
    `,
    [userId]
  );

  const redemptionMap = new Map();
  redemptionsResult.rows.forEach((item) => redemptionMap.set(Number(item.package_id), item));

  return packagesResult.rows.map((pkg) => {
    const redemption = redemptionMap.get(Number(pkg.id));
    const pointsCost = getPackagePointsCost(pkg);

    return {
      id: pkg.id,
      level: Number(pkg.level),
      name: pkg.name,
      priceUsdt: pkg.price_usdt,
      dailyIncomeUsdt: pkg.daily_income_usdt,
      validDays: Number(pkg.valid_days || 0),
      waterRewardUsdt: pkg.task_reward_usdt,
      pointsCost,
      redemption: redemption ? {
        id: redemption.id,
        status: redemption.status,
        pointsCost: Number(redemption.points_cost || 0),
        requestedAt: redemption.requested_at,
        reviewedAt: redemption.reviewed_at,
        adminNote: redemption.admin_note,
      } : null,
    };
  });
}

module.exports = {
  ensureFreePlantPointsSchema,
  syncDirectInvitePoints,
  createFreePlantPurchasePoints,
  getPointsSummary,
  getPackagesForPoints,
  getPackagePointsCost,
  normalizePoints,
};
