const pool = require("../config/db");
const {
  ensureSecuritySchema,
  logSecurityEvent,
  REVIEW_IP_THRESHOLD,
  SUSPICIOUS_IP_THRESHOLD,
} = require("../services/securityService");

function normalizeReason(value, fallback) {
  const reason = String(value || "").trim();
  return reason || fallback;
}

async function getSecurityUsers(req, res) {
  try {
    await ensureSecuritySchema(pool);

    const result = await pool.query(
      `
      WITH ip_counts AS (
        SELECT ip, COUNT(DISTINCT user_id)::int AS total_accounts
        FROM (
          SELECT id AS user_id, register_ip AS ip FROM users WHERE register_ip IS NOT NULL
          UNION ALL
          SELECT id AS user_id, last_login_ip AS ip FROM users WHERE last_login_ip IS NOT NULL
        ) x
        WHERE ip IS NOT NULL AND ip <> ''
        GROUP BY ip
      ), mining AS (
        SELECT
          ma.user_id,
          ma.status AS mining_status,
          ma.invested_amount,
          ma.current_plan_id,
          mp.name AS plan_name,
          mp.level AS plan_level
        FROM mining_accounts ma
        LEFT JOIN mining_plans mp ON mp.id = ma.current_plan_id
      )
      SELECT
        u.id,
        u.email,
        u.referral_code,
        u.referred_by_id,
        sponsor.email AS sponsor_email,
        u.created_at,
        u.register_ip,
        u.last_login_ip,
        u.last_login_at,
        COALESCE(GREATEST(reg_count.total_accounts, login_count.total_accounts), 0) AS related_ip_accounts,
        u.is_suspicious,
        u.suspicious_reason,
        u.suspicious_at,
        u.is_banned,
        u.banned_reason,
        u.banned_at,
        m.mining_status,
        COALESCE(m.invested_amount, 0) AS invested_amount,
        m.current_plan_id,
        m.plan_name,
        m.plan_level,
        CASE
          WHEN u.is_banned THEN 'banned'
          WHEN u.is_suspicious THEN 'suspicious'
          WHEN COALESCE(GREATEST(reg_count.total_accounts, login_count.total_accounts), 0) >= $1 THEN 'review'
          ELSE 'normal'
        END AS risk_status
      FROM users u
      LEFT JOIN users sponsor ON sponsor.id = u.referred_by_id
      LEFT JOIN ip_counts reg_count ON reg_count.ip = u.register_ip
      LEFT JOIN ip_counts login_count ON login_count.ip = u.last_login_ip
      LEFT JOIN mining m ON m.user_id = u.id
      ORDER BY
        u.is_banned DESC,
        u.is_suspicious DESC,
        COALESCE(GREATEST(reg_count.total_accounts, login_count.total_accounts), 0) DESC,
        u.created_at DESC
      LIMIT 500
      `,
      [REVIEW_IP_THRESHOLD]
    );

    return res.json({ users: result.rows });
  } catch (error) {
    console.error("GET SECURITY USERS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar usuarios de seguridad.", detail: error.message });
  }
}

async function getRepeatedIps(req, res) {
  try {
    await ensureSecuritySchema(pool);

    const result = await pool.query(
      `
      WITH user_ips AS (
        SELECT id AS user_id, email, register_ip AS ip FROM users WHERE register_ip IS NOT NULL
        UNION
        SELECT id AS user_id, email, last_login_ip AS ip FROM users WHERE last_login_ip IS NOT NULL
      ), mining AS (
        SELECT
          ma.user_id,
          ma.status,
          COALESCE(ma.invested_amount, 0) AS invested_amount
        FROM mining_accounts ma
      )
      SELECT
        ui.ip,
        COUNT(DISTINCT ui.user_id)::int AS total_accounts,
        COUNT(DISTINCT ui.user_id) FILTER (WHERE m.status = 'active' AND m.invested_amount >= 5)::int AS active_mining_accounts,
        COALESCE(SUM(DISTINCT CASE WHEN m.status = 'active' THEN m.invested_amount ELSE 0 END), 0) AS active_invested_usdt,
        STRING_AGG(DISTINCT ui.email, ', ' ORDER BY ui.email) AS users,
        CASE
          WHEN COUNT(DISTINCT ui.user_id) >= $1 THEN 'suspicious'
          WHEN COUNT(DISTINCT ui.user_id) >= $2 THEN 'review'
          ELSE 'info'
        END AS risk_status
      FROM user_ips ui
      LEFT JOIN mining m ON m.user_id = ui.user_id
      WHERE ui.ip IS NOT NULL AND ui.ip <> ''
      GROUP BY ui.ip
      HAVING COUNT(DISTINCT ui.user_id) >= 2
      ORDER BY total_accounts DESC, active_mining_accounts DESC
      LIMIT 300
      `,
      [SUSPICIOUS_IP_THRESHOLD, REVIEW_IP_THRESHOLD]
    );

    return res.json({ ips: result.rows });
  } catch (error) {
    console.error("GET REPEATED IPS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar IPs repetidas.", detail: error.message });
  }
}

async function getSecurityEvents(req, res) {
  const { userId } = req.params;

  try {
    await ensureSecuritySchema(pool);

    const result = await pool.query(
      `
      SELECT e.id, e.user_id, e.event_type, e.reason, e.ip_address, e.created_by, admin.email AS created_by_email, e.created_at
      FROM user_security_events e
      LEFT JOIN users admin ON admin.id = e.created_by
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT 100
      `,
      [userId]
    );

    return res.json({ events: result.rows });
  } catch (error) {
    console.error("GET SECURITY EVENTS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar eventos de seguridad.", detail: error.message });
  }
}

async function markSuspicious(req, res) {
  const adminUserId = req.user.userId;
  const { userId } = req.params;
  const reason = normalizeReason(req.body?.reason, "Marcado manualmente como sospechoso por administrador.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSecuritySchema(client);

    const result = await client.query(
      `
      UPDATE users
      SET is_suspicious = true,
          suspicious_reason = $2,
          suspicious_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, is_suspicious, suspicious_reason, suspicious_at, is_banned
      `,
      [userId, reason]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    await logSecurityEvent(client, {
      userId,
      eventType: "MANUAL_MARK_SUSPICIOUS",
      reason,
      createdBy: adminUserId,
    });

    await client.query("COMMIT");
    return res.json({ message: "Usuario marcado como sospechoso.", user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("MARK SUSPICIOUS ERROR:", error);
    return res.status(500).json({ message: "Error al marcar sospechoso.", detail: error.message });
  } finally {
    client.release();
  }
}

async function clearSuspicious(req, res) {
  const adminUserId = req.user.userId;
  const { userId } = req.params;
  const reason = normalizeReason(req.body?.reason, "Sospecha liberada manualmente por administrador.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSecuritySchema(client);

    const result = await client.query(
      `
      UPDATE users
      SET is_suspicious = false,
          suspicious_reason = NULL,
          suspicious_at = NULL
      WHERE id = $1
      RETURNING id, email, is_suspicious, suspicious_reason, suspicious_at, is_banned
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    await logSecurityEvent(client, {
      userId,
      eventType: "MANUAL_CLEAR_SUSPICIOUS",
      reason,
      createdBy: adminUserId,
    });

    await client.query("COMMIT");
    return res.json({ message: "Sospecha retirada correctamente.", user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CLEAR SUSPICIOUS ERROR:", error);
    return res.status(500).json({ message: "Error al quitar sospecha.", detail: error.message });
  } finally {
    client.release();
  }
}

async function banUser(req, res) {
  const adminUserId = req.user.userId;
  const { userId } = req.params;
  const reason = normalizeReason(req.body?.reason, "Usuario restringido manualmente por administrador.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSecuritySchema(client);

    const result = await client.query(
      `
      UPDATE users
      SET is_banned = true,
          banned_reason = $2,
          banned_at = CURRENT_TIMESTAMP,
          banned_by = $3,
          is_suspicious = true,
          suspicious_reason = COALESCE(suspicious_reason, $2),
          suspicious_at = COALESCE(suspicious_at, CURRENT_TIMESTAMP)
      WHERE id = $1
      RETURNING id, email, is_banned, banned_reason, banned_at, banned_by, is_suspicious
      `,
      [userId, reason, adminUserId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    await logSecurityEvent(client, {
      userId,
      eventType: "MANUAL_BAN",
      reason,
      createdBy: adminUserId,
    });

    await client.query("COMMIT");
    return res.json({ message: "Usuario baneado/restringido correctamente.", user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("BAN USER ERROR:", error);
    return res.status(500).json({ message: "Error al banear usuario.", detail: error.message });
  } finally {
    client.release();
  }
}

async function unbanUser(req, res) {
  const adminUserId = req.user.userId;
  const { userId } = req.params;
  const reason = normalizeReason(req.body?.reason, "Usuario desbaneado manualmente por administrador.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSecuritySchema(client);

    const result = await client.query(
      `
      UPDATE users
      SET is_banned = false,
          banned_reason = NULL,
          banned_at = NULL,
          banned_by = NULL
      WHERE id = $1
      RETURNING id, email, is_banned, banned_reason, banned_at, is_suspicious
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    await logSecurityEvent(client, {
      userId,
      eventType: "MANUAL_UNBAN",
      reason,
      createdBy: adminUserId,
    });

    await client.query("COMMIT");
    return res.json({ message: "Usuario desbaneado correctamente.", user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("UNBAN USER ERROR:", error);
    return res.status(500).json({ message: "Error al desbanear usuario.", detail: error.message });
  } finally {
    client.release();
  }
}

async function markIpSuspicious(req, res) {
  const adminUserId = req.user.userId;
  const { ip } = req.params;
  const decodedIp = decodeURIComponent(ip || "");
  const reason = normalizeReason(req.body?.reason, `Marcado manual por IP repetida: ${decodedIp}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSecuritySchema(client);

    const result = await client.query(
      `
      UPDATE users
      SET is_suspicious = true,
          suspicious_reason = $2,
          suspicious_at = CURRENT_TIMESTAMP
      WHERE register_ip = $1 OR last_login_ip = $1
      RETURNING id, email
      `,
      [decodedIp, reason]
    );

    for (const row of result.rows) {
      await logSecurityEvent(client, {
        userId: row.id,
        eventType: "MANUAL_MARK_IP_SUSPICIOUS",
        reason,
        ipAddress: decodedIp,
        createdBy: adminUserId,
      });
    }

    await client.query("COMMIT");
    return res.json({ message: `Se marcaron ${result.rowCount || 0} cuentas como sospechosas.`, affected: result.rows });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("MARK IP SUSPICIOUS ERROR:", error);
    return res.status(500).json({ message: "Error al marcar IP sospechosa.", detail: error.message });
  } finally {
    client.release();
  }
}

module.exports = {
  getSecurityUsers,
  getRepeatedIps,
  getSecurityEvents,
  markSuspicious,
  clearSuspicious,
  banUser,
  unbanUser,
  markIpSuspicious,
};
