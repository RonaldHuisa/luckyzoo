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

function cleanBalanceType(value) {
  const type = String(value || "").trim().toLowerCase();
  return ["recharge", "withdrawable", "coins"].includes(type) ? type : "";
}

function cleanDirection(value) {
  const direction = String(value || "").trim().toLowerCase();
  return ["credit", "debit"].includes(direction) ? direction : "";
}

function parsePositiveAmount(value, { integer = false } = {}) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return integer ? Math.floor(raw) : Number(raw.toFixed(6));
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
        COALESCE(u.recharge_balance_usdt,0) AS recharge_balance_usdt,
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
        COALESCE(wd.withdrawals_count,0) AS withdrawals_count,
        COALESCE(dep.total_recharged,0) AS total_recharged,
        COALESCE(vip.active_vip_level,0) AS active_vip_level,
        vip.active_vip_name,
        uwa.network AS withdrawal_network,
        uwa.withdrawal_address,
        COALESCE(dw.deposit_wallets, '[]'::json) AS deposit_wallets
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
        SELECT SUM(w.amount_to_receive) AS total_withdrawn, COUNT(*)::int AS withdrawals_count
        FROM withdrawals w
        WHERE w.user_id = u.id
          AND w.status IN ('paid','approved','pending')
      ) wd ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(d.amount_usdt) AS total_recharged
        FROM deposits d
        WHERE d.user_id = u.id
          AND d.status = 'confirmed'
      ) dep ON TRUE
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
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('network', w.network, 'address', w.address) ORDER BY w.network) AS deposit_wallets
        FROM wallets w
        WHERE w.user_id = u.id
      ) dw ON TRUE
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
        SELECT
          d.id,
          d.user_id,
          u.email,
          d.network,
          d.tx_hash,
          d.amount_usdt,
          d.status,
          d.created_at,
          w.address AS deposit_wallet_address
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN wallets w ON w.id = d.wallet_id
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT 300
      `),
      pool.query(`
        SELECT
          al.id,
          al.user_id,
          u.email,
          al.balance_type,
          al.direction,
          al.type,
          al.title,
          al.amount_usdt,
          al.description,
          al.metadata,
          al.created_at
        FROM account_ledger al
        JOIN users u ON u.id = al.user_id
        WHERE al.type IN ('manual_recharge','manual_investment','admin_balance_adjustment','admin_credit','admin_recharge')
          AND al.balance_type IN ('recharge','investment','withdrawable','roulette_coins')
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT 300
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

async function adjustUserBalance(req, res) {
  const userId = Number(req.params.userId);
  const balanceType = cleanBalanceType(req.body?.balanceType);
  const direction = cleanDirection(req.body?.direction);
  const amount = parsePositiveAmount(req.body?.amount, { integer: balanceType === "coins" });
  const reason = String(req.body?.reason || "").trim();
  const adminId = Number(req.user?.userId || 0) || null;

  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  if (!balanceType) return res.status(400).json({ message: "Tipo inválido. Usa recharge, withdrawable o coins." });
  if (!direction) return res.status(400).json({ message: "Operación inválida. Usa credit o debit." });
  if (!amount) return res.status(400).json({ message: "Monto inválido." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roulette_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);

    const current = await client.query(
      `SELECT id,email,
              COALESCE(balance_usdt,0) AS balance_usdt,
              COALESCE(recharge_balance_usdt,0) AS recharge_balance_usdt,
              COALESCE(withdrawable_usdt,0) AS withdrawable_usdt,
              COALESCE(earnings_balance_usdt,0) AS earnings_balance_usdt,
              COALESCE(roulette_coins,0) AS roulette_coins
       FROM users
       WHERE id=$1
       FOR UPDATE`,
      [userId]
    );

    if (!current.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const row = current.rows[0];
    const currentBalance = Number(row.balance_usdt || 0);
    const currentRecharge = Number(row.recharge_balance_usdt || 0);
    const currentWithdrawable = Number(row.withdrawable_usdt || 0);
    const currentEarnings = Number(row.earnings_balance_usdt || 0);
    const currentCoins = Number(row.roulette_coins || 0);

    if (direction === "debit") {
      if (balanceType === "recharge" && (currentBalance < amount || currentRecharge < amount)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El usuario no tiene suficiente saldo de recarga." });
      }
      if (balanceType === "withdrawable" && currentWithdrawable < amount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El usuario no tiene suficiente saldo retirable." });
      }
      if (balanceType === "coins" && currentCoins < amount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El usuario no tiene suficientes monedas." });
      }
    }

    let updated;
    let title;
    let ledgerBalanceType = balanceType === "coins" ? "roulette_coins" : balanceType;
    let ledgerAmountUsdt = balanceType === "coins" ? 0 : amount;

    if (balanceType === "recharge") {
      title = direction === "credit" ? "Saldo de recarga añadido por admin" : "Saldo de recarga descontado por admin";
      updated = await client.query(
        direction === "credit"
          ? `UPDATE users SET balance_usdt=COALESCE(balance_usdt,0)+$1, recharge_balance_usdt=COALESCE(recharge_balance_usdt,0)+$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt,roulette_coins`
          : `UPDATE users SET balance_usdt=COALESCE(balance_usdt,0)-$1, recharge_balance_usdt=COALESCE(recharge_balance_usdt,0)-$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt,roulette_coins`,
        [amount, userId]
      );
    } else if (balanceType === "withdrawable") {
      title = direction === "credit" ? "Saldo retirable añadido por admin" : "Saldo retirable descontado por admin";
      updated = await client.query(
        direction === "credit"
          ? `UPDATE users SET withdrawable_usdt=COALESCE(withdrawable_usdt,0)+$1, earnings_balance_usdt=COALESCE(earnings_balance_usdt,0)+$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt,roulette_coins`
          : `UPDATE users SET withdrawable_usdt=COALESCE(withdrawable_usdt,0)-$1, earnings_balance_usdt=GREATEST(COALESCE(earnings_balance_usdt,0)-$1,0) WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt,roulette_coins`,
        [amount, userId]
      );
    } else {
      title = direction === "credit" ? "Monedas añadidas por admin" : "Monedas descontadas por admin";
      updated = await client.query(
        direction === "credit"
          ? `UPDATE users SET roulette_coins=COALESCE(roulette_coins,0)+$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt,roulette_coins`
          : `UPDATE users SET roulette_coins=COALESCE(roulette_coins,0)-$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt,roulette_coins`,
        [amount, userId]
      );
    }

    const ledger = await client.query(
      `INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
       VALUES ($1,$2,$3,'admin_balance_adjustment',$4,$5,$6,'admin_panel',$7,$8::jsonb,'completed')
       RETURNING id,created_at`,
      [
        userId,
        ledgerBalanceType,
        direction,
        title,
        ledgerAmountUsdt,
        reason || "Ajuste manual realizado desde panel administrativo Lucky Zoo.",
        adminId,
        JSON.stringify({
          adminId,
          balanceType,
          direction,
          amount,
          amountCoins: balanceType === "coins" ? amount : 0,
          previous: {
            balance_usdt: currentBalance,
            recharge_balance_usdt: currentRecharge,
            withdrawable_usdt: currentWithdrawable,
            earnings_balance_usdt: currentEarnings,
            roulette_coins: currentCoins,
          },
        }),
      ]
    );

    await client.query("COMMIT");
    return res.json({
      message: direction === "credit" ? "Saldo añadido correctamente." : "Saldo descontado correctamente.",
      user: updated.rows[0],
      ledgerId: ledger.rows[0].id,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADMIN ADJUST BALANCE ERROR:", error);
    return res.status(500).json({ message: "Error al ajustar saldo.", detail: error.message });
  } finally {
    client.release();
  }
}

async function listTopUsers(req, res) {
  try {
    const vip = String(req.query.vip || "all").trim().toLowerCase();
    const params = [];
    let filter = "";

    if (vip !== "all" && vip !== "") {
      if (vip === "free" || vip === "gratis" || vip === "0") {
        filter = "WHERE active_vip_level = 0";
      } else {
        const level = Math.max(0, Math.min(5, Math.floor(Number(vip))));
        params.push(level);
        filter = "WHERE active_vip_level = $1";
      }
    }

    const baseCte = `
      WITH base AS (
        SELECT
          u.id,
          u.email,
          u.created_at,
          u.referral_code,
          COALESCE(u.withdrawable_usdt,0) AS withdrawable_usdt,
          COALESCE(u.roulette_coins,0) AS roulette_coins,
          COALESCE(refs.direct_referrals,0) AS direct_referrals,
          COALESCE(wds.withdrawals_count,0) AS withdrawals_count,
          COALESCE(wds.total_withdrawn,0) AS total_withdrawn,
          COALESCE(vip.active_vip_level,0) AS active_vip_level
        FROM users u
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS direct_referrals
          FROM users child
          WHERE child.referred_by_id = u.id
        ) refs ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS withdrawals_count, SUM(amount_to_receive) AS total_withdrawn
          FROM withdrawals w
          WHERE w.user_id = u.id
            AND w.status IN ('paid','approved','pending')
        ) wds ON TRUE
        LEFT JOIN LATERAL (
          SELECT vp.level AS active_vip_level
          FROM vip_purchases vp
          WHERE vp.user_id = u.id
            AND vp.status = 'active'
            AND (vp.expires_at IS NULL OR vp.expires_at > NOW())
            AND vp.level >= 1
          ORDER BY vp.level DESC, vp.id DESC
          LIMIT 1
        ) vip ON TRUE
        WHERE COALESCE(u.is_admin,false) = false
      )
    `;

    const [coins, withdrawable, withdrawals, referrals] = await Promise.all([
      pool.query(`${baseCte} SELECT * FROM base ${filter} ORDER BY roulette_coins DESC, id ASC LIMIT 20`, params),
      pool.query(`${baseCte} SELECT * FROM base ${filter} ORDER BY withdrawable_usdt DESC, id ASC LIMIT 20`, params),
      pool.query(`${baseCte} SELECT * FROM base ${filter} ORDER BY withdrawals_count DESC, total_withdrawn DESC, id ASC LIMIT 20`, params),
      pool.query(`${baseCte} SELECT * FROM base ${filter} ORDER BY direct_referrals DESC, id ASC LIMIT 20`, params),
    ]);

    return res.json({
      filterVip: vip || "all",
      topCoins: coins.rows,
      topWithdrawable: withdrawable.rows,
      topWithdrawals: withdrawals.rows,
      topReferrals: referrals.rows,
    });
  } catch (error) {
    console.error("ADMIN TOP USERS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar tops.", detail: error.message });
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
  adjustUserBalance,
  listTopUsers,
};
