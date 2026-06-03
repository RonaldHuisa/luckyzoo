const pool = require("../config/db");
const { ensureMiningSchema, refreshMiningAccountForUser } = require("../services/miningService");
const { ensureHashRewardsSchema, ensureUserHashPoints } = require("../services/hashRewardsService");

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

async function getReferralSummaryForUser(clientOrPool, userId) {
  const result = await clientOrPool.query(
    `
    WITH l1 AS (
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE COALESCE(ma.invested_amount, 0) > 0)::int AS invested_count,
        COUNT(*) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10)::int AS valid_10_count,
        COALESCE(SUM(COALESCE(ma.invested_amount, 0)), 0) AS invested_total,
        COALESCE(SUM(COALESCE(ma.invested_amount, 0)) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10), 0) AS valid_10_total
      FROM users u1
      LEFT JOIN mining_accounts ma ON ma.user_id = u1.id
      WHERE u1.referred_by_id = $1
    ),
    l2 AS (
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE COALESCE(ma.invested_amount, 0) > 0)::int AS invested_count,
        COUNT(*) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10)::int AS valid_10_count,
        COALESCE(SUM(COALESCE(ma.invested_amount, 0)), 0) AS invested_total,
        COALESCE(SUM(COALESCE(ma.invested_amount, 0)) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10), 0) AS valid_10_total
      FROM users u1
      JOIN users u2 ON u2.referred_by_id = u1.id
      LEFT JOIN mining_accounts ma ON ma.user_id = u2.id
      WHERE u1.referred_by_id = $1
    ),
    l3 AS (
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE COALESCE(ma.invested_amount, 0) > 0)::int AS invested_count,
        COUNT(*) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10)::int AS valid_10_count,
        COALESCE(SUM(COALESCE(ma.invested_amount, 0)), 0) AS invested_total,
        COALESCE(SUM(COALESCE(ma.invested_amount, 0)) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10), 0) AS valid_10_total
      FROM users u1
      JOIN users u2 ON u2.referred_by_id = u1.id
      JOIN users u3 ON u3.referred_by_id = u2.id
      LEFT JOIN mining_accounts ma ON ma.user_id = u3.id
      WHERE u1.referred_by_id = $1
    )
    SELECT
      COALESCE(l1.total_count, 0) AS l1_total_count,
      COALESCE(l1.invested_count, 0) AS l1_invested_count,
      COALESCE(l1.valid_10_count, 0) AS l1_valid_10_count,
      COALESCE(l1.invested_total, 0) AS l1_invested_total,
      COALESCE(l1.valid_10_total, 0) AS l1_valid_10_total,
      COALESCE(l2.total_count, 0) AS l2_total_count,
      COALESCE(l2.invested_count, 0) AS l2_invested_count,
      COALESCE(l2.valid_10_count, 0) AS l2_valid_10_count,
      COALESCE(l2.invested_total, 0) AS l2_invested_total,
      COALESCE(l2.valid_10_total, 0) AS l2_valid_10_total,
      COALESCE(l3.total_count, 0) AS l3_total_count,
      COALESCE(l3.invested_count, 0) AS l3_invested_count,
      COALESCE(l3.valid_10_count, 0) AS l3_valid_10_count,
      COALESCE(l3.invested_total, 0) AS l3_invested_total,
      COALESCE(l3.valid_10_total, 0) AS l3_valid_10_total
    FROM l1, l2, l3
    `,
    [userId]
  );

  const row = result.rows[0] || {};
  return {
    level1: {
      totalCount: Number(row.l1_total_count || 0),
      investedCount: Number(row.l1_invested_count || 0),
      valid10Count: Number(row.l1_valid_10_count || 0),
      investedTotal: toNumber(row.l1_invested_total),
      valid10Total: toNumber(row.l1_valid_10_total),
    },
    level2: {
      totalCount: Number(row.l2_total_count || 0),
      investedCount: Number(row.l2_invested_count || 0),
      valid10Count: Number(row.l2_valid_10_count || 0),
      investedTotal: toNumber(row.l2_invested_total),
      valid10Total: toNumber(row.l2_valid_10_total),
    },
    level3: {
      totalCount: Number(row.l3_total_count || 0),
      investedCount: Number(row.l3_invested_count || 0),
      valid10Count: Number(row.l3_valid_10_count || 0),
      investedTotal: toNumber(row.l3_invested_total),
      valid10Total: toNumber(row.l3_valid_10_total),
    },
  };
}

async function getPromoters(req, res) {
  const search = normalizeEmail(req.query?.search || "");

  try {
    await ensureMiningSchema(pool);

    const result = await pool.query(
      `
      WITH l1 AS (
        SELECT
          ref.id AS user_id,
          COUNT(inv.id)::int AS level1_total_count,
          COUNT(inv.id) FILTER (WHERE COALESCE(ma.invested_amount, 0) > 0)::int AS level1_invested_count,
          COUNT(inv.id) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10)::int AS level1_valid_10_count,
          COALESCE(SUM(COALESCE(ma.invested_amount, 0)), 0) AS level1_invested_total,
          COALESCE(SUM(COALESCE(ma.invested_amount, 0)) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10), 0) AS level1_valid_10_total
        FROM users ref
        JOIN users inv ON inv.referred_by_id = ref.id
        LEFT JOIN mining_accounts ma ON ma.user_id = inv.id
        GROUP BY ref.id
      ),
      l2 AS (
        SELECT
          ref.id AS user_id,
          COUNT(l2u.id)::int AS level2_total_count,
          COUNT(l2u.id) FILTER (WHERE COALESCE(ma.invested_amount, 0) > 0)::int AS level2_invested_count,
          COUNT(l2u.id) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10)::int AS level2_valid_10_count,
          COALESCE(SUM(COALESCE(ma.invested_amount, 0)), 0) AS level2_invested_total,
          COALESCE(SUM(COALESCE(ma.invested_amount, 0)) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10), 0) AS level2_valid_10_total
        FROM users ref
        JOIN users l1u ON l1u.referred_by_id = ref.id
        JOIN users l2u ON l2u.referred_by_id = l1u.id
        LEFT JOIN mining_accounts ma ON ma.user_id = l2u.id
        GROUP BY ref.id
      ),
      l3 AS (
        SELECT
          ref.id AS user_id,
          COUNT(l3u.id)::int AS level3_total_count,
          COUNT(l3u.id) FILTER (WHERE COALESCE(ma.invested_amount, 0) > 0)::int AS level3_invested_count,
          COUNT(l3u.id) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10)::int AS level3_valid_10_count,
          COALESCE(SUM(COALESCE(ma.invested_amount, 0)), 0) AS level3_invested_total,
          COALESCE(SUM(COALESCE(ma.invested_amount, 0)) FILTER (WHERE COALESCE(ma.invested_amount, 0) >= 10), 0) AS level3_valid_10_total
        FROM users ref
        JOIN users l1u ON l1u.referred_by_id = ref.id
        JOIN users l2u ON l2u.referred_by_id = l1u.id
        JOIN users l3u ON l3u.referred_by_id = l2u.id
        LEFT JOIN mining_accounts ma ON ma.user_id = l3u.id
        GROUP BY ref.id
      ),
      mining AS (
        SELECT
          ma.user_id,
          ma.invested_amount,
          ma.daily_percent,
          ma.daily_reward,
          ma.status AS mining_status,
          mp.name AS plan_name,
          mp.level AS plan_level
        FROM mining_accounts ma
        LEFT JOIN mining_plans mp ON mp.id = ma.current_plan_id
      )
      SELECT
        ref.id,
        ref.email,
        ref.referral_code,
        ref.created_at,
        COALESCE(m.invested_amount, 0) AS promoter_invested_amount,
        COALESCE(m.daily_percent, 0) AS promoter_daily_percent,
        m.plan_name,
        m.plan_level,
        COALESCE(l1.level1_total_count, 0) AS level1_total_count,
        COALESCE(l1.level1_invested_count, 0) AS level1_invested_count,
        COALESCE(l1.level1_valid_10_count, 0) AS level1_valid_10_count,
        COALESCE(l1.level1_invested_total, 0) AS level1_invested_total,
        COALESCE(l1.level1_valid_10_total, 0) AS level1_valid_10_total,
        COALESCE(l2.level2_total_count, 0) AS level2_total_count,
        COALESCE(l2.level2_invested_count, 0) AS level2_invested_count,
        COALESCE(l2.level2_valid_10_count, 0) AS level2_valid_10_count,
        COALESCE(l2.level2_invested_total, 0) AS level2_invested_total,
        COALESCE(l2.level2_valid_10_total, 0) AS level2_valid_10_total,
        COALESCE(l3.level3_total_count, 0) AS level3_total_count,
        COALESCE(l3.level3_invested_count, 0) AS level3_invested_count,
        COALESCE(l3.level3_valid_10_count, 0) AS level3_valid_10_count,
        COALESCE(l3.level3_invested_total, 0) AS level3_invested_total,
        COALESCE(l3.level3_valid_10_total, 0) AS level3_valid_10_total
      FROM users ref
      JOIN l1 ON l1.user_id = ref.id
      LEFT JOIN l2 ON l2.user_id = ref.id
      LEFT JOIN l3 ON l3.user_id = ref.id
      LEFT JOIN mining m ON m.user_id = ref.id
      WHERE COALESCE(l1.level1_invested_count, 0) > 0
        AND ($1::text = '' OR LOWER(ref.email) LIKE '%' || $1::text || '%')
      ORDER BY
        COALESCE(l1.level1_invested_count, 0) DESC,
        COALESCE(l1.level1_invested_total, 0) DESC,
        ref.id ASC
      LIMIT 300
      `,
      [search]
    );

    return res.json({ promoters: result.rows });
  } catch (error) {
    console.error("GET ADMIN GROWTH PROMOTERS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar promotores.", detail: error.message });
  }
}

async function getUserOverview(req, res) {
  const email = normalizeEmail(req.query?.email || "");
  if (!email) {
    return res.status(400).json({ message: "Ingresa un correo para buscar." });
  }

  try {
    await ensureMiningSchema(pool);
    await ensureHashRewardsSchema(pool);

    const userResult = await pool.query(
      `
      WITH withdrawals_total AS (
        SELECT
          user_id,
          COALESCE(SUM(amount_requested) FILTER (WHERE status = 'paid'), 0) AS withdrawn_requested_usdt,
          COALESCE(SUM(amount_to_receive) FILTER (WHERE status = 'paid'), 0) AS withdrawn_received_usdt,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_withdrawals_count
        FROM withdrawals
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.email,
        u.referral_code,
        u.created_at,
        COALESCE(u.balance_usdt, 0) AS balance_usdt,
        COALESCE(u.recharge_balance_usdt, 0) AS recharge_balance_usdt,
        COALESCE(u.withdrawable_usdt, 0) AS withdrawable_usdt,
        COALESCE(u.earnings_balance_usdt, 0) AS earnings_balance_usdt,
        COALESCE(ma.invested_amount, 0) AS invested_amount,
        COALESCE(ma.daily_percent, 0) AS daily_percent,
        COALESCE(ma.daily_reward, 0) AS daily_reward,
        ma.status AS mining_status,
        mp.name AS plan_name,
        mp.level AS plan_level,
        COALESCE(hp.hash_bonus_percent, 0) AS hash_bonus_percent,
        COALESCE(hp.max_bonus_percent, 5.00) AS max_bonus_percent,
        COALESCE(hp.available_points, 0)::int AS available_points,
        COALESCE(hp.redeemed_points, 0)::int AS redeemed_points,
        COALESCE(wt.withdrawn_requested_usdt, 0) AS withdrawn_requested_usdt,
        COALESCE(wt.withdrawn_received_usdt, 0) AS withdrawn_received_usdt,
        COALESCE(wt.paid_withdrawals_count, 0)::int AS paid_withdrawals_count
      FROM users u
      LEFT JOIN mining_accounts ma ON ma.user_id = u.id
      LEFT JOIN mining_plans mp ON mp.id = ma.current_plan_id
      LEFT JOIN user_hash_points hp ON hp.user_id = u.id
      LEFT JOIN withdrawals_total wt ON wt.user_id = u.id
      WHERE LOWER(u.email) = $1
      LIMIT 1
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "El usuario no existe." });
    }

    const user = userResult.rows[0];
    const referrals = await getReferralSummaryForUser(pool, user.id);

    return res.json({ user, referrals });
  } catch (error) {
    console.error("GET ADMIN GROWTH USER ERROR:", error);
    return res.status(500).json({ message: "Error al consultar usuario.", detail: error.message });
  }
}

async function addManualInvestment(req, res) {
  const adminUserId = req.user.userId;
  const email = normalizeEmail(req.body?.email);
  const amount = normalizeAmount(req.body?.amount);
  const note = String(req.body?.note || "").trim();

  if (!email) return res.status(400).json({ message: "Ingresa el correo del usuario." });
  if (!amount) return res.status(400).json({ message: "Ingresa un monto válido mayor a 0." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureMiningSchema(client);

    const userResult = await client.query(
      `SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1 FOR UPDATE`,
      [email]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "El usuario no existe." });
    }

    const user = userResult.rows[0];

    const walletResult = await client.query(
      `SELECT id FROM wallets WHERE user_id = $1 ORDER BY id ASC LIMIT 1`,
      [user.id]
    );

    if (walletResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El usuario existe, pero no tiene wallet registrada." });
    }

    const walletId = walletResult.rows[0].id;
    const txHash = `manual_admin_panel_${user.id}_${Date.now()}`;

    const depositResult = await client.query(
      `
      INSERT INTO deposits
        (user_id, wallet_id, network, token_contract, tx_hash, log_index, block_number, amount_raw, amount_usdt, status, sweep_status, created_at)
      VALUES
        ($1, $2, 'BEP20-USDT', 'manual-admin-credit', $3, 0, $4, $5, $6, 'confirmed', 'hidden_manual', CURRENT_TIMESTAMP)
      RETURNING id
      `,
      [
        user.id,
        walletId,
        txHash,
        Math.floor(Date.now() / 1000),
        String(BigInt(Math.round(amount * 1000000)) * 1000000000000n),
        amount,
      ]
    );

    const depositId = depositResult.rows[0].id;

    await client.query(
      `
      INSERT INTO account_ledger
        (user_id, type, title, amount_usdt, balance_type, direction, description, reference_type, reference_id, status, metadata, created_at)
      VALUES
        ($1, 'admin_manual_investment', 'Recarga manual administrativa', $2, 'investment', 'credit', $3, 'deposit', $4, 'completed', $5::jsonb, CURRENT_TIMESTAMP)
      `,
      [
        user.id,
        amount,
        note || 'Ajuste administrativo de inversión desde panel admin',
        depositId,
        JSON.stringify({
          source: 'admin_growth_panel',
          adminUserId,
          txHash,
          hiddenFromAdminDeposits: true,
          note,
        }),
      ]
    );

    await client.query(
      `
      UPDATE users
      SET
        balance_usdt = COALESCE(balance_usdt, 0) + $1,
        recharge_balance_usdt = COALESCE(recharge_balance_usdt, 0) + $1
      WHERE id = $2
      `,
      [amount, user.id]
    );

    const refreshed = await refreshMiningAccountForUser(client, user.id);
    await client.query("COMMIT");

    return res.json({
      message: "Inversión agregada correctamente.",
      depositId,
      user: {
        id: user.id,
        email: user.email,
      },
      mining: refreshed?.account || null,
      plan: refreshed?.plan || null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADD MANUAL INVESTMENT ERROR:", error);
    return res.status(500).json({ message: "Error al agregar inversión manual.", detail: error.message });
  } finally {
    client.release();
  }
}

async function addManualMiningPower(req, res) {
  const email = normalizeEmail(req.body?.email);
  const percent = normalizeAmount(req.body?.percent);
  const note = String(req.body?.note || "").trim();

  if (!email) return res.status(400).json({ message: "Ingresa el correo del usuario." });
  if (!percent) return res.status(400).json({ message: "Ingresa un porcentaje válido mayor a 0." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureMiningSchema(client);
    await ensureHashRewardsSchema(client);

    const userResult = await client.query(
      `SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1 FOR UPDATE`,
      [email]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "El usuario no existe." });
    }

    const user = userResult.rows[0];
    await ensureUserHashPoints(client, user.id);

    const pointsResult = await client.query(
      `
      UPDATE user_hash_points
      SET
        hash_bonus_percent = LEAST(COALESCE(max_bonus_percent, 5.00), COALESCE(hash_bonus_percent, 0) + $2::numeric),
        redeemed_points = COALESCE(redeemed_points, 0) + CEIL($2::numeric / 0.05),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING available_points, redeemed_points, hash_bonus_percent, max_bonus_percent
      `,
      [user.id, percent]
    );

    await client.query(
      `
      INSERT INTO account_ledger
        (user_id, type, title, amount_usdt, balance_type, direction, description, reference_type, status, metadata, created_at)
      VALUES
        ($1, 'admin_manual_hash_power', 'Aumento manual de potencia minera', 0, 'hash_power', 'credit', $2, 'admin_adjustment', 'completed', $3::jsonb, CURRENT_TIMESTAMP)
      `,
      [
        user.id,
        note || `Ajuste administrativo de +${percent}% de potencia minera`,
        JSON.stringify({ source: 'admin_growth_panel', percent, note }),
      ]
    );

    const refreshed = await refreshMiningAccountForUser(client, user.id);
    await client.query("COMMIT");

    return res.json({
      message: "Potencia minera agregada correctamente.",
      user: {
        id: user.id,
        email: user.email,
      },
      hash: pointsResult.rows[0] || null,
      mining: refreshed?.account || null,
      plan: refreshed?.plan || null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADD MANUAL MINING POWER ERROR:", error);
    return res.status(500).json({ message: "Error al agregar potencia minera.", detail: error.message });
  } finally {
    client.release();
  }
}

module.exports = {
  getPromoters,
  getUserOverview,
  addManualInvestment,
  addManualMiningPower,
};
