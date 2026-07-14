const pool = require("../config/db");

function safeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

async function ensureCreditPointsSchema(clientOrPool = pool) {
  await clientOrPool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS credit_points INTEGER DEFAULT 50 NOT NULL
  `);

  await clientOrPool.query(`
    ALTER TABLE users
      ALTER COLUMN credit_points SET DEFAULT 50
  `);

  await clientOrPool.query(`
    UPDATE users
    SET credit_points = 50
    WHERE credit_points IS NULL
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS credit_point_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(60) NOT NULL,
      event_key VARCHAR(160),
      operation VARCHAR(30) NOT NULL,
      points_delta INTEGER NOT NULL DEFAULT 0,
      previous_points INTEGER NOT NULL DEFAULT 0,
      next_points INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_point_events_user_key
    ON credit_point_events(user_id, event_key)
    WHERE event_key IS NOT NULL
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS idx_credit_point_events_user_created
    ON credit_point_events(user_id, created_at DESC)
  `);
}

async function hasEvent(client, userId, eventKey) {
  if (!eventKey) return false;
  const result = await client.query(
    `SELECT id FROM credit_point_events WHERE user_id=$1 AND event_key=$2 LIMIT 1`,
    [userId, eventKey]
  );
  return result.rows.length > 0;
}

async function adjustCreditPoints(client, {
  userId,
  operation,
  points,
  reason,
  eventType = "manual_adjustment",
  eventKey = null,
  createdBy = null,
  metadata = {},
}) {
  await ensureCreditPointsSchema(client);

  const safeUserId = Number(userId);
  if (!safeUserId) throw new Error("Usuario inválido.");

  const qty = safeInt(points, 0);
  if (!Number.isFinite(qty) || qty < 0) throw new Error("Puntos inválidos.");

  if (!["add", "subtract", "set", "milestone"].includes(operation)) {
    throw new Error("Operación de puntos inválida.");
  }

  if (eventKey && await hasEvent(client, safeUserId, eventKey)) {
    const current = await client.query(
      `SELECT id,email,COALESCE(credit_points,50)::int AS credit_points FROM users WHERE id=$1`,
      [safeUserId]
    );
    return {
      skipped: true,
      duplicate: true,
      user: current.rows[0] || null,
      previousPoints: Number(current.rows[0]?.credit_points || 0),
      nextPoints: Number(current.rows[0]?.credit_points || 0),
      delta: 0,
    };
  }

  const current = await client.query(
    `SELECT id,email,COALESCE(credit_points,50)::int AS credit_points FROM users WHERE id=$1 FOR UPDATE`,
    [safeUserId]
  );

  if (!current.rows.length) throw new Error("Usuario no encontrado.");

  const previous = safeInt(current.rows[0].credit_points, 50);
  let next = previous;

  if (operation === "add") next = previous + qty;
  if (operation === "subtract") next = Math.max(0, previous - qty);
  if (operation === "set") next = qty;
  if (operation === "milestone") next = Math.max(previous, qty);

  const delta = next - previous;

  const updated = await client.query(
    `UPDATE users SET credit_points=$1 WHERE id=$2 RETURNING id,email,credit_points`,
    [next, safeUserId]
  );

  let event = null;
  try {
    const eventResult = await client.query(
      `
      INSERT INTO credit_point_events
        (user_id,event_type,event_key,operation,points_delta,previous_points,next_points,reason,created_by,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
      RETURNING *
      `,
      [
        safeUserId,
        eventType,
        eventKey,
        operation,
        delta,
        previous,
        next,
        reason || "Ajuste de puntos de crédito.",
        createdBy || null,
        JSON.stringify(metadata || {}),
      ]
    );
    event = eventResult.rows[0] || null;
  } catch (error) {
    // Si por algún motivo no puede guardar historial, no bloqueamos el ajuste principal.
    console.warn("CREDIT POINT EVENT SKIPPED:", error.message);
  }

  return {
    skipped: false,
    duplicate: false,
    user: updated.rows[0],
    previousPoints: previous,
    nextPoints: next,
    delta,
    event,
  };
}

async function awardCreditPointMilestone(clientOrPool, userId, minPoints, eventKey, reason, metadata = {}, createdBy = null) {
  return adjustCreditPoints(clientOrPool, {
    userId,
    operation: "milestone",
    points: minPoints,
    reason,
    eventType: "milestone",
    eventKey,
    createdBy,
    metadata,
  });
}

async function awardValidatedReferralCreditPoint(client, { sponsorId, invitedUserId, adminId = null }) {
  if (!sponsorId || !invitedUserId) return null;
  return adjustCreditPoints(client, {
    userId: sponsorId,
    operation: "add",
    points: 1,
    reason: "Invitado validado por gerente. +1 punto automático para el invitador.",
    eventType: "validated_referral_bonus",
    eventKey: `validated_invitee:${invitedUserId}`,
    createdBy: adminId,
    metadata: { invitedUserId },
  });
}

module.exports = {
  ensureCreditPointsSchema,
  adjustCreditPoints,
  awardCreditPointMilestone,
  awardValidatedReferralCreditPoint,
};
