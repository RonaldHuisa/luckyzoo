const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { isValidEvmAddress } = require("../utils/paymentNetworks");

const SUPPORTED_WITHDRAW_NETWORKS = new Set(["BEP20-USDT", "POLYGON-USDT"]);

async function ensureAdminPanelSchema(client = pool) {
  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS withdraw_required_referrals INTEGER DEFAULT 0 NOT NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_users_referred_by_id
    ON users(referred_by_id)
  `);
}

function num(value) {
  return Number(value || 0);
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function cleanNetwork(value) {
  const network = String(value || "").trim().toUpperCase();
  return SUPPORTED_WITHDRAW_NETWORKS.has(network) ? network : "";
}

function cleanWallet(value) {
  return String(value || "").trim();
}

async function getDashboard(req, res) {
  try {
    await ensureAdminPanelSchema();

    const [
      usersResult,
      kpisResult,
      withdrawalsResult,
      investmentsResult,
      depositsResult,
      ticketsResult,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total_users FROM users`),
      pool.query(`
        SELECT
          COALESCE((
            SELECT SUM(vp.price_usdt)
            FROM vip_purchases vp
            JOIN users u ON u.id = vp.user_id
            WHERE COALESCE(u.is_admin,false) = false
              AND vp.level >= 1
              AND COALESCE(vp.price_usdt,0) > 0
              AND vp.status IN ('active','expired','completed','replaced','cancelled')
          ),0) AS total_invested,
          COALESCE((
            SELECT SUM(w.amount_to_receive)
            FROM withdrawals w
            JOIN users u ON u.id = w.user_id
            WHERE COALESCE(u.is_admin,false) = false
              AND w.status = 'paid'
          ),0) AS total_withdrawn,
          COALESCE((
            SELECT SUM(d.amount_usdt)
            FROM deposits d
            JOIN users u ON u.id = d.user_id
            WHERE COALESCE(u.is_admin,false) = false
              AND d.status = 'confirmed'
          ),0) AS normal_recharges,
          COALESCE((
            SELECT SUM(ABS(al.amount_usdt))
            FROM account_ledger al
            JOIN users u ON u.id = al.user_id
            WHERE COALESCE(u.is_admin,false) = false
              AND al.direction = 'credit'
              AND al.balance_type IN ('recharge','investment')
              AND al.type IN ('manual_recharge','manual_investment','admin_balance_adjustment','admin_credit','admin_recharge')
              AND COALESCE(al.amount_usdt,0) > 0
          ),0) AS admin_recharges
      `),
      pool.query(`SELECT COUNT(*)::int AS pending_withdrawals FROM withdrawals WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(DISTINCT user_id)::int AS investors FROM vip_purchases WHERE level >= 1 AND COALESCE(price_usdt,0) > 0`),
      pool.query(`SELECT COUNT(*)::int AS confirmed_deposits FROM deposits WHERE status = 'confirmed'`),
      pool.query(`
        SELECT
          COALESCE(COUNT(*) FILTER (WHERE status <> 'closed'), 0)::int AS open_tickets
        FROM support_tickets
      `).catch(() => ({ rows: [{ open_tickets: 0 }] })),
    ]);

    return res.json({
      totalUsers: num(usersResult.rows[0]?.total_users),
      totalInvested: money(kpisResult.rows[0]?.total_invested),
      totalWithdrawn: money(kpisResult.rows[0]?.total_withdrawn),
      normalRecharges: money(kpisResult.rows[0]?.normal_recharges),
      adminRecharges: money(kpisResult.rows[0]?.admin_recharges),
      pendingWithdrawals: num(withdrawalsResult.rows[0]?.pending_withdrawals),
      investors: num(investmentsResult.rows[0]?.investors),
      confirmedDeposits: num(depositsResult.rows[0]?.confirmed_deposits),
      openTickets: num(ticketsResult.rows[0]?.open_tickets),
    });
  } catch (error) {
    console.error("ADMIN DASHBOARD ERROR:", error);
    return res.status(500).json({ message: "Error al cargar panel admin.", detail: error.message });
  }
}

async function listUsers(req, res) {
  try {
    await ensureAdminPanelSchema();

    const search = String(req.query.search || "").trim();
    const params = [];
    let where = "";

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where = `WHERE LOWER(u.email) LIKE $1 OR LOWER(u.referral_code) LIKE $1 OR CAST(u.id AS TEXT) = REPLACE($1,'%','')`;
    }

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.created_at,
        COALESCE(u.is_admin,false) AS is_admin,
        COALESCE(u.balance_usdt,0) AS balance_usdt,
        COALESCE(u.withdrawable_usdt,0) AS withdrawable_usdt,
        COALESCE(u.roulette_coins,0) AS roulette_coins,
        u.referral_code,
        u.referred_by_id,
        ref.email AS referrer_email,
        ref.referral_code AS referrer_code,
        COALESCE(u.withdraw_required_referrals,0) AS withdraw_required_referrals,
        COALESCE(directs.total_direct,0) AS direct_referrals,
        COALESCE(inv.total_invested,0) AS total_invested,
        COALESCE(wd.total_withdrawn,0) AS total_withdrawn,
        COALESCE(vip.active_vip_level,0) AS active_vip_level,
        vip.active_vip_name,
        uwa.network AS withdrawal_network,
        uwa.withdrawal_address
      FROM users u
      LEFT JOIN users ref ON ref.id = u.referred_by_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS total_direct
        FROM users child
        WHERE child.referred_by_id = u.id
      ) directs ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(vp.price_usdt) AS total_invested
        FROM vip_purchases vp
        WHERE vp.user_id = u.id
          AND vp.level >= 1
          AND COALESCE(vp.price_usdt,0) > 0
          AND vp.status IN ('active','expired','completed','replaced','cancelled')
      ) inv ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(w.amount_to_receive) AS total_withdrawn
        FROM withdrawals w
        WHERE w.user_id = u.id
          AND w.status = 'paid'
      ) wd ON TRUE
      LEFT JOIN LATERAL (
        SELECT vp.level AS active_vip_level, pkg.name AS active_vip_name
        FROM vip_purchases vp
        LEFT JOIN vip_packages pkg ON pkg.id = vp.package_id
        WHERE vp.user_id = u.id
          AND vp.status = 'active'
          AND (vp.expires_at IS NULL OR vp.expires_at > NOW())
          AND vp.level >= 1
        ORDER BY vp.level DESC, vp.id DESC
        LIMIT 1
      ) vip ON TRUE
      LEFT JOIN LATERAL (
        SELECT network, withdrawal_address
        FROM user_withdrawal_accounts
        WHERE user_id = u.id
        ORDER BY is_default DESC, id ASC
        LIMIT 1
      ) uwa ON TRUE
      ${where}
      ORDER BY u.id DESC
      LIMIT 200
      `,
      params
    );

    return res.json({ users: result.rows });
  } catch (error) {
    console.error("ADMIN LIST USERS ERROR:", error);
    return res.status(500).json({ message: "Error al listar usuarios.", detail: error.message });
  }
}

async function listInvestments(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        vp.id,
        vp.user_id,
        u.email,
        vp.level,
        pkg.name AS package_name,
        vp.price_usdt,
        vp.status,
        vp.purchased_at,
        vp.expires_at
      FROM vip_purchases vp
      JOIN users u ON u.id = vp.user_id
      LEFT JOIN vip_packages pkg ON pkg.id = vp.package_id
      WHERE vp.level >= 1
      ORDER BY vp.purchased_at DESC, vp.id DESC
      LIMIT 300
    `);

    return res.json({ investments: result.rows });
  } catch (error) {
    console.error("ADMIN LIST INVESTMENTS ERROR:", error);
    return res.status(500).json({ message: "Error al listar inversiones.", detail: error.message });
  }
}

async function listWithdrawals(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        w.id,
        w.user_id,
        u.email,
        w.network,
        w.withdrawal_address,
        w.amount_requested,
        w.fee_percent,
        w.fee_amount,
        w.amount_to_receive,
        w.status,
        w.tx_hash,
        w.created_at,
        w.paid_at,
        w.approved_at
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      ORDER BY w.created_at DESC, w.id DESC
      LIMIT 300
    `);

    return res.json({ withdrawals: result.rows });
  } catch (error) {
    console.error("ADMIN LIST WITHDRAWALS ERROR:", error);
    return res.status(500).json({ message: "Error al listar retiros.", detail: error.message });
  }
}

async function listRecharges(req, res) {
  try {
    const [normal, admin] = await Promise.all([
      pool.query(`
        SELECT d.id, d.user_id, u.email, d.network, d.tx_hash, d.amount_usdt, d.status, d.created_at
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT 200
      `),
      pool.query(`
        SELECT al.id, al.user_id, u.email, al.type, al.title, al.amount_usdt, al.description, al.created_at
        FROM account_ledger al
        JOIN users u ON u.id = al.user_id
        WHERE al.direction = 'credit'
          AND al.balance_type IN ('recharge','investment')
          AND al.type IN ('manual_recharge','manual_investment','admin_balance_adjustment','admin_credit','admin_recharge')
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT 200
      `),
    ]);

    return res.json({ normalRecharges: normal.rows, adminRecharges: admin.rows });
  } catch (error) {
    console.error("ADMIN LIST RECHARGES ERROR:", error);
    return res.status(500).json({ message: "Error al listar recargas.", detail: error.message });
  }
}

async function updateReferralLimit(req, res) {
  const userId = Number(req.params.userId);
  const requiredReferrals = Math.max(0, Math.floor(Number(req.body?.requiredReferrals || 0)));

  if (!userId) return res.status(400).json({ message: "Usuario inválido." });

  try {
    await ensureAdminPanelSchema();
    const result = await pool.query(
      `
      UPDATE users
      SET withdraw_required_referrals = $1
      WHERE id = $2
      RETURNING id, email, withdraw_required_referrals
      `,
      [requiredReferrals, userId]
    );

    if (!result.rows.length) return res.status(404).json({ message: "Usuario no encontrado." });

    return res.json({ message: "Límite de referidos actualizado.", user: result.rows[0] });
  } catch (error) {
    console.error("ADMIN UPDATE REFERRAL LIMIT ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar límite.", detail: error.message });
  }
}

async function changeUserPassword(req, res) {
  const userId = Number(req.params.userId);
  const newPassword = String(req.body?.newPassword || "").trim();

  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  if (newPassword.length < 6) return res.status(400).json({ message: "La nueva contraseña debe tener mínimo 6 caracteres." });

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      RETURNING id, email
      `,
      [passwordHash, userId]
    );

    if (!result.rows.length) return res.status(404).json({ message: "Usuario no encontrado." });

    return res.json({ message: "Contraseña actualizada.", user: result.rows[0] });
  } catch (error) {
    console.error("ADMIN CHANGE PASSWORD ERROR:", error);
    return res.status(500).json({ message: "Error al cambiar contraseña.", detail: error.message });
  }
}

async function updateWithdrawalWallet(req, res) {
  const userId = Number(req.params.userId);
  const network = cleanNetwork(req.body?.network);
  const withdrawalAddress = cleanWallet(req.body?.withdrawalAddress || req.body?.wallet || req.body?.address);

  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  if (!network) return res.status(400).json({ message: "Red inválida." });
  if (!withdrawalAddress || !isValidEvmAddress(withdrawalAddress)) {
    return res.status(400).json({ message: "Dirección wallet inválida." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const duplicate = await client.query(
      `
      SELECT id, user_id
      FROM user_withdrawal_accounts
      WHERE LOWER(withdrawal_address) = LOWER($1)
        AND user_id <> $2
      LIMIT 1
      `,
      [withdrawalAddress, userId]
    );

    if (duplicate.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Wallet ya usada. Está prohibido multicuentas." });
    }

    const existing = await client.query(
      `SELECT id FROM user_withdrawal_accounts WHERE user_id = $1 ORDER BY is_default DESC, id ASC LIMIT 1`,
      [userId]
    );

    let result;
    if (existing.rows.length) {
      result = await client.query(
        `
        UPDATE user_withdrawal_accounts
        SET network = $1,
            label = $1,
            withdrawal_address = $2,
            is_default = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
        `,
        [network, withdrawalAddress, existing.rows[0].id]
      );
    } else {
      result = await client.query(
        `
        INSERT INTO user_withdrawal_accounts (user_id, network, label, withdrawal_address, is_default, updated_at)
        VALUES ($1, $2, $2, $3, true, CURRENT_TIMESTAMP)
        RETURNING *
        `,
        [userId, network, withdrawalAddress]
      );
    }

    await client.query(
      `
      UPDATE users
      SET withdraw_enabled = true,
          withdraw_enabled_at = COALESCE(withdraw_enabled_at, NOW()),
          withdraw_enabled_note = 'Wallet modificada por administrador.'
      WHERE id = $1
      `,
      [userId]
    );

    await client.query("COMMIT");

    return res.json({ message: "Wallet de retiro actualizada.", wallet: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADMIN UPDATE WALLET ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar wallet.", detail: error.message });
  } finally {
    client.release();
  }
}

module.exports = {
  ensureAdminPanelSchema,
  getDashboard,
  listUsers,
  listInvestments,
  listWithdrawals,
  listRecharges,
  updateReferralLimit,
  changeUserPassword,
  updateWithdrawalWallet,
};
