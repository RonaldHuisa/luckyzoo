const pool = require("../config/db");
const { refreshMiningAccountForUser } = require("../services/miningService");

const EVENT_CODE = "PROMO_GREENVEST_2026_05_21_V2";

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getUserId(req) {
  return req.user?.userId || req.user?.id;
}

const PROMO_TASKS = [
  {
    code: "promo_1_register_3",
    title: "Tarea 1",
    description: "Invita 3 personas nuevas a que se registren con tu enlace durante el evento.",
    metricType: "registrations",
    requiredCount: 3,
    progressOffset: 0,
    rewardAmount: 0.5,
    rewardType: "investment_usdt",
    sortOrder: 1,
  },
  {
    code: "promo_2_register_5_more",
    title: "Tarea 2",
    description: "Invita otras 5 personas nuevas a registrarse con tu enlace durante el evento.",
    metricType: "registrations",
    requiredCount: 5,
    progressOffset: 3,
    rewardAmount: 1,
    rewardType: "investment_usdt",
    sortOrder: 2,
  },
  {
    code: "promo_3_register_5_more",
    title: "Tarea 3",
    description: "Invita otras 5 personas nuevas a registrarse con tu enlace durante el evento.",
    metricType: "registrations",
    requiredCount: 5,
    progressOffset: 8,
    rewardAmount: 1,
    rewardType: "investment_usdt",
    sortOrder: 3,
  },
  {
    code: "promo_4_invest_3",
    title: "Tarea 4",
    description: "Logra que 3 invitados directos recarguen mínimo 5 USDT dentro de la fecha del evento.",
    metricType: "active_deposits",
    requiredCount: 3,
    progressOffset: 0,
    rewardAmount: 2,
    rewardType: "investment_usdt",
    sortOrder: 4,
  },
  {
    code: "promo_5_invest_20_more",
    title: "Tarea 5",
    description: "Después de la promo anterior, consigue 20 invitados adicionales que recarguen mínimo 5 USDT dentro del evento.",
    metricType: "active_deposits",
    requiredCount: 20,
    progressOffset: 3,
    rewardAmount: 10,
    rewardType: "investment_usdt",
    sortOrder: 5,
  },
  {
    code: "promo_6_invest_50_more",
    title: "Tarea 6",
    description: "Después de la promo anterior, consigue 50 invitados adicionales que recarguen mínimo 5 USDT dentro del evento.",
    metricType: "active_deposits",
    requiredCount: 50,
    progressOffset: 23,
    rewardAmount: 35,
    rewardType: "withdrawable_usdt",
    sortOrder: 6,
  },
];

async function ensurePromoEventSchema(clientOrPool = pool) {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS promo_events (
      id SERIAL PRIMARY KEY,
      code VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      starts_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      ends_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS promo_tasks (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES promo_events(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      title VARCHAR(160) NOT NULL,
      description TEXT,
      metric_type VARCHAR(40) NOT NULL,
      required_count INTEGER NOT NULL DEFAULT 0,
      progress_offset INTEGER NOT NULL DEFAULT 0,
      reward_type VARCHAR(50) NOT NULL DEFAULT 'investment_usdt',
      reward_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, code)
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS promo_event_claims (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES promo_events(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES promo_tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(30) NOT NULL DEFAULT 'claimed',
      progress_count INTEGER NOT NULL DEFAULT 0,
      total_count_at_claim INTEGER NOT NULL DEFAULT 0,
      reward_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
      reward_applied BOOLEAN NOT NULL DEFAULT false,
      claimed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, task_id, user_id)
    )
  `);

  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_promo_event_claims_user ON promo_event_claims(user_id, event_id)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_promo_event_claims_event ON promo_event_claims(event_id, claimed_at DESC)`);

  await clientOrPool.query(`
    INSERT INTO promo_events (code, name, starts_at, ends_at, is_active)
    VALUES (
      $1,
      'Evento Promoción GreenVest',
      TIMESTAMP '2026-05-22 00:00:00',
      TIMESTAMP '2026-05-30 23:59:59',
      true
    )
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      is_active = true,
      updated_at = NOW()
  `, [EVENT_CODE]);

  const eventResult = await clientOrPool.query(`SELECT * FROM promo_events WHERE code = $1 LIMIT 1`, [EVENT_CODE]);
  const event = eventResult.rows[0];

  await clientOrPool.query(`UPDATE promo_tasks SET is_active = false, updated_at = NOW() WHERE event_id = $1`, [event.id]);

  for (const task of PROMO_TASKS) {
    await clientOrPool.query(`
      INSERT INTO promo_tasks
      (
        event_id,
        code,
        title,
        description,
        metric_type,
        required_count,
        progress_offset,
        reward_type,
        reward_amount,
        sort_order,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
      ON CONFLICT (event_id, code) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        metric_type = EXCLUDED.metric_type,
        required_count = EXCLUDED.required_count,
        progress_offset = EXCLUDED.progress_offset,
        reward_type = EXCLUDED.reward_type,
        reward_amount = EXCLUDED.reward_amount,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        updated_at = NOW()
    `, [
      event.id,
      task.code,
      task.title,
      task.description,
      task.metricType,
      task.requiredCount,
      task.progressOffset,
      task.rewardType || "investment_usdt",
      task.rewardAmount,
      task.sortOrder,
    ]);
  }

  await clientOrPool.query(
    `
    UPDATE promo_tasks
    SET reward_amount = 35.000000,
        reward_type = 'withdrawable_usdt',
        title = 'Tarea 6',
        updated_at = NOW()
    WHERE event_id = $1
      AND code = 'promo_6_invest_50_more'
    `,
    [event.id]
  );


  return event;
}

async function getCurrentEvent(clientOrPool = pool) {
  await ensurePromoEventSchema(clientOrPool);
  const result = await clientOrPool.query(
    `SELECT * FROM promo_events WHERE code = $1 LIMIT 1`,
    [EVENT_CODE]
  );
  return result.rows[0] || null;
}

async function getReferralLink(clientOrPool, userId) {
  const result = await clientOrPool.query(
    `SELECT referral_code FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  const code = result.rows[0]?.referral_code || "";
  const base = process.env.FRONTEND_URL || "https://yunxhi.vip";
  return code ? `${base.replace(/\/$/, "")}/register?ref=${encodeURIComponent(code)}` : `${base.replace(/\/$/, "")}/register`;
}

async function getRegistrationCount(clientOrPool, userId, event) {
  const result = await clientOrPool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM users invited
    WHERE invited.referred_by_id = $1
      AND invited.created_at >= $2
      AND invited.created_at <= $3
    `,
    [userId, event.starts_at, event.ends_at]
  );
  return Number(result.rows[0]?.total || 0);
}

async function getActiveInvestorCount(clientOrPool, userId, event) {
  const result = await clientOrPool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM (
      SELECT inv.id
      FROM users inv
      JOIN deposits d ON d.user_id = inv.id
      WHERE inv.referred_by_id = $1
        AND d.status = 'confirmed'
        AND d.created_at >= $2
        AND d.created_at <= $3
        AND COALESCE(d.sweep_status, '') NOT IN ('manual', 'hidden_manual')
        AND COALESCE(d.tx_hash, '') NOT LIKE 'manual_admin_recharge_%'
        AND COALESCE(d.token_contract, '') <> 'manual-admin-credit'
      GROUP BY inv.id
      HAVING SUM(COALESCE(d.amount_usdt, 0)) >= 5
    ) valid_users
    `,
    [userId, event.starts_at, event.ends_at]
  );
  return Number(result.rows[0]?.total || 0);
}

async function getActiveInvestorDetails(clientOrPool, userId, event) {
  const result = await clientOrPool.query(
    `
    SELECT
      inv.id,
      inv.email,
      SUM(COALESCE(d.amount_usdt, 0)) AS invested_during_event,
      MIN(d.created_at) AS first_deposit_at
    FROM users inv
    JOIN deposits d ON d.user_id = inv.id
    WHERE inv.referred_by_id = $1
      AND d.status = 'confirmed'
      AND d.created_at >= $2
      AND d.created_at <= $3
      AND COALESCE(d.sweep_status, '') NOT IN ('manual', 'hidden_manual')
      AND COALESCE(d.tx_hash, '') NOT LIKE 'manual_admin_recharge_%'
      AND COALESCE(d.token_contract, '') <> 'manual-admin-credit'
    GROUP BY inv.id, inv.email
    HAVING SUM(COALESCE(d.amount_usdt, 0)) >= 5
    ORDER BY first_deposit_at DESC
    LIMIT 100
    `,
    [userId, event.starts_at, event.ends_at]
  );

  return result.rows;
}

async function getRegistrationDetails(clientOrPool, userId, event) {
  const result = await clientOrPool.query(
    `
    SELECT id, email, created_at
    FROM users
    WHERE referred_by_id = $1
      AND created_at >= $2
      AND created_at <= $3
    ORDER BY created_at DESC
    LIMIT 100
    `,
    [userId, event.starts_at, event.ends_at]
  );

  return result.rows;
}

function buildTaskPayload(task, claim, metrics, prerequisitesMet) {
  const baseTotal = task.metric_type === 'active_deposits'
    ? metrics.activeInvestorCount
    : metrics.registrationCount;

  const offset = Number(task.progress_offset || 0);
  const required = Number(task.required_count || 0);
  const progress = Math.max(0, Math.min(required, baseTotal - offset));
  const requiredTotal = offset + required;
  const isCompleted = baseTotal >= requiredTotal;
  const isClaimed = Boolean(claim);
  const canClaim = prerequisitesMet && isCompleted && !isClaimed;

  return {
    id: task.id,
    code: task.code,
    title: task.title,
    description: task.description,
    metricType: task.metric_type,
    requiredCount: required,
    progressOffset: offset,
    requiredTotal,
    rewardType: task.reward_type,
    rewardAmount: Number(task.reward_amount || 0),
    progress,
    totalProgress: baseTotal,
    isCompleted,
    isClaimed,
    canClaim,
    isLockedBySequence: !prerequisitesMet && !isClaimed,
    claimedAt: claim?.claimed_at || null,
    status: isClaimed ? 'claimed' : (!prerequisitesMet ? 'locked' : (isCompleted ? 'ready' : 'in_progress')),
  };
}

async function getPromoEventStatus(req, res) {
  const userId = getUserId(req);

  try {
    const event = await getCurrentEvent(pool);

    if (!event) {
      return res.status(404).json({ message: 'Evento no encontrado.' });
    }

    const tasksResult = await pool.query(
      `
      SELECT *
      FROM promo_tasks
      WHERE event_id = $1
        AND is_active = true
      ORDER BY sort_order ASC
      `,
      [event.id]
    );

    const claimsResult = await pool.query(
      `
      SELECT
        pc.*,
        pt.code AS task_code
      FROM promo_event_claims pc
      JOIN promo_tasks pt ON pt.id = pc.task_id
      WHERE pc.event_id = $1
        AND pc.user_id = $2
      `,
      [event.id, userId]
    );

    const claimsByTask = new Map(claimsResult.rows.map((item) => [item.task_code, item]));
    const registrationCount = await getRegistrationCount(pool, userId, event);
    const activeInvestorCount = await getActiveInvestorCount(pool, userId, event);
    const referralLink = await getReferralLink(pool, userId);

    const serverNow = new Date();
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);
    const isActive = Boolean(event.is_active) && serverNow >= startsAt && serverNow <= endsAt;

    const metrics = { registrationCount, activeInvestorCount };
    let prerequisitesMet = true;
    const tasks = tasksResult.rows.map((task) => {
      const claim = claimsByTask.get(task.code);
      const payload = buildTaskPayload(task, claim, metrics, prerequisitesMet);
      if (!claim) {
        prerequisitesMet = false;
      }
      return payload;
    });

    const totalReward = 50;

    return res.json({
      event: {
        id: event.id,
        code: event.code,
        name: event.name,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        isActive,
        serverNow: serverNow.toISOString(),
      },
      referralLink,
      promoText: `⛏️ GreenVest | Minería con Inteligencia Artificial

GreenVest es una plataforma digital de minería inteligente diseñada para activar planes mineros y generar ingresos diarios según el nivel de inversión del usuario.

Enlace de registro:
${referralLink}`,
      metrics,
      tasks,
      totalReward,
      totalRewardRounded: 50,
    });
  } catch (error) {
    console.error('GET PROMO EVENT STATUS ERROR:', error);
    return res.status(500).json({
      message: 'Error al cargar el evento.',
      detail: error.message,
    });
  }
}

async function applyInvestmentReward(client, { userId, rewardAmount, rewardType, taskCode, taskTitle, claimId }) {
  const amount = toNumber(rewardAmount);
  const type = rewardType || "investment_usdt";

  if (amount <= 0) return null;

  let user;

  if (type === "withdrawable_usdt") {
    const userResult = await client.query(
      `
      UPDATE users
      SET withdrawable_usdt = COALESCE(withdrawable_usdt, 0) + $1
      WHERE id = $2
      RETURNING id, email, withdrawable_usdt
      `,
      [amount, userId]
    );

    user = userResult.rows[0];

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
        status,
        created_at
      )
      VALUES ($1,'withdrawable','credit','promo_event_reward',$2,$3,$4,'promo_event_claim',$5,$6::jsonb,'completed',NOW())
      `,
      [
        userId,
        "Recompensa retirable de evento GreenVest",
        amount,
        `Recompensa de ${amount} USDT por ${taskTitle}.`,
        claimId,
        JSON.stringify({
          source: "promo_event",
          event_code: EVENT_CODE,
          task_code: taskCode,
          reward_type: type,
        }),
      ]
    );

    return user;
  }

  const userResult = await client.query(
    `
    UPDATE users
    SET
      balance_usdt = COALESCE(balance_usdt, 0) + $1,
      recharge_balance_usdt = COALESCE(recharge_balance_usdt, 0) + $1
    WHERE id = $2
    RETURNING id, email, balance_usdt, recharge_balance_usdt
    `,
    [amount, userId]
  );

  user = userResult.rows[0];

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
      status,
      created_at
    )
    VALUES ($1,'investment','credit','promo_event_reward',$2,$3,$4,'promo_event_claim',$5,$6::jsonb,'completed',NOW())
    `,
    [
      userId,
      "Recompensa de evento GreenVest",
      amount,
      `Recompensa de ${amount} USDT de inversión por ${taskTitle}.`,
      claimId,
      JSON.stringify({
        source: "promo_event",
        event_code: EVENT_CODE,
        task_code: taskCode,
        reward_type: type,
      }),
    ]
  );

  await refreshMiningAccountForUser(client, {
    userId: user.id,
    email: user.email,
  });

  return user;
}

async function claimPromoTask(req, res) {
  const userId = getUserId(req);
  const { taskCode } = req.params;
  const client = await pool.connect();

  try {
    await ensurePromoEventSchema(client);
    await client.query('BEGIN');

    const eventResult = await client.query(`SELECT * FROM promo_events WHERE code = $1 LIMIT 1`, [EVENT_CODE]);
    const event = eventResult.rows[0];

    if (!event) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Evento no encontrado.' });
    }

    const now = new Date();
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);
    if (!event.is_active || now < startsAt || now > endsAt) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El evento no está activo.' });
    }

    const taskResult = await client.query(
      `
      SELECT *
      FROM promo_tasks
      WHERE event_id = $1
        AND code = $2
        AND is_active = true
      LIMIT 1
      `,
      [event.id, taskCode]
    );

    if (!taskResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Tarea no encontrada.' });
    }

    const task = taskResult.rows[0];

    const existingResult = await client.query(
      `
      SELECT id
      FROM promo_event_claims
      WHERE event_id = $1
        AND task_id = $2
        AND user_id = $3
      LIMIT 1
      `,
      [event.id, task.id, userId]
    );
    if (existingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Esta recompensa ya fue reclamada.' });
    }

    const previousTasksResult = await client.query(
      `
      SELECT id, code
      FROM promo_tasks
      WHERE event_id = $1
        AND is_active = true
        AND sort_order < $2
      ORDER BY sort_order ASC
      `,
      [event.id, task.sort_order]
    );

    if (previousTasksResult.rows.length) {
      const previousIds = previousTasksResult.rows.map((item) => item.id);
      const previousClaimsResult = await client.query(
        `
        SELECT task_id
        FROM promo_event_claims
        WHERE event_id = $1
          AND user_id = $2
          AND task_id = ANY($3::int[])
        `,
        [event.id, userId, previousIds]
      );

      if (previousClaimsResult.rows.length !== previousIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Debes reclamar primero las promociones anteriores.' });
      }
    }

    const registrationCount = await getRegistrationCount(client, userId, event);
    const activeInvestorCount = await getActiveInvestorCount(client, userId, event);
    const metrics = { registrationCount, activeInvestorCount };
    const taskPayload = buildTaskPayload(task, null, metrics, true);

    if (!taskPayload.isCompleted) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Todavía no cumples el requisito de esta promoción.' });
    }

    const claimResult = await client.query(
      `
      INSERT INTO promo_event_claims
      (
        event_id,
        task_id,
        user_id,
        status,
        progress_count,
        total_count_at_claim,
        reward_amount,
        reward_applied,
        claimed_at,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,'claimed',$4,$5,$6,false,NOW(),NOW(),NOW())
      RETURNING id
      `,
      [
        event.id,
        task.id,
        userId,
        taskPayload.progress,
        taskPayload.totalProgress,
        task.reward_amount,
      ]
    );

    const claimId = claimResult.rows[0].id;

    await applyInvestmentReward(client, {
      userId,
      rewardAmount: task.reward_amount,
      rewardType: task.reward_type,
      taskCode: task.code,
      taskTitle: task.title,
      claimId,
    });

    await client.query(
      `
      UPDATE promo_event_claims
      SET reward_applied = true, updated_at = NOW()
      WHERE id = $1
      `,
      [claimId]
    );

    await client.query('COMMIT');

    const rewardLabel = task.reward_type === "withdrawable_usdt" ? "USDT retirable" : "USDT de inversión";

    return res.status(201).json({
      message: `Recompensa aplicada correctamente: +${Number(task.reward_amount).toFixed(2)} ${rewardLabel}.`,
      claimId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CLAIM PROMO TASK ERROR:', error);
    return res.status(500).json({
      message: 'Error al reclamar recompensa.',
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

async function listAdminPromoClaims(req, res) {
  try {
    const event = await getCurrentEvent(pool);
    await ensurePromoEventSchema(pool);

    const claimsResult = await pool.query(
      `
      SELECT
        pc.id,
        pc.status,
        pc.progress_count,
        pc.total_count_at_claim,
        pc.reward_amount,
        pc.reward_applied,
        pc.claimed_at,
        u.id AS user_id,
        u.email,
        pt.code AS task_code,
        pt.title AS task_title,
        pt.metric_type,
        pt.required_count,
        pt.progress_offset,
        pe.name AS event_name
      FROM promo_event_claims pc
      JOIN users u ON u.id = pc.user_id
      JOIN promo_tasks pt ON pt.id = pc.task_id
      JOIN promo_events pe ON pe.id = pc.event_id
      WHERE pc.event_id = $1
      ORDER BY pc.claimed_at DESC
      LIMIT 250
      `,
      [event.id]
    );

    return res.json({ event, claims: claimsResult.rows });
  } catch (error) {
    console.error('LIST ADMIN PROMO CLAIMS ERROR:', error);
    return res.status(500).json({ message: 'Error al cargar reclamos del evento.', detail: error.message });
  }
}

async function getAdminPromoUserDetail(req, res) {
  const { userId } = req.params;
  try {
    const event = await getCurrentEvent(pool);
    if (!event) {
      return res.status(404).json({ message: 'Evento no encontrado.' });
    }

    const [registrations, activeInvestors] = await Promise.all([
      getRegistrationDetails(pool, userId, event),
      getActiveInvestorDetails(pool, userId, event),
    ]);

    return res.json({ event, registrations, activeInvestors });
  } catch (error) {
    console.error('GET ADMIN PROMO USER DETAIL ERROR:', error);
    return res.status(500).json({ message: 'Error al cargar detalle del usuario.', detail: error.message });
  }
}

module.exports = {
  ensurePromoEventSchema,
  getPromoEventStatus,
  claimPromoTask,
  listAdminPromoClaims,
  getAdminPromoUserDetail,
};
