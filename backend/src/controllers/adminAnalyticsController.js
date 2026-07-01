const pool = require("../config/db");
const { ensureRouletteSchema, normalizePrize, normalizeSpin } = require("../services/rouletteService");
const { seedRoyalVipPackages } = require("../services/royalAiTaskService");

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Number(n.toFixed(6)) : 0;
}

function intValue(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getLimit(value, fallback = 50, max = 200) {
  const n = Number(value || fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function getOffset(page, limit) {
  const p = Math.max(1, Number(page || 1));
  return (p - 1) * limit;
}

function buildQuestion(row) {
  return {
    id: row.id,
    levelMin: intValue(row.level_min),
    category: row.category,
    asset: row.asset,
    chartType: row.chart_type,
    title: row.title,
    question: row.question,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
    correctOption: row.correct_option,
    isActive: row.is_active,
    createdAt: row.created_at,
    responseCount: intValue(row.response_count),
    correctCount: intValue(row.correct_count),
    accuracyPercent: row.response_count ? Number(((Number(row.correct_count || 0) / Number(row.response_count || 1)) * 100).toFixed(2)) : 0,
  };
}

async function getAdminOverview(req, res) {
  const client = await pool.connect();
  try {
    await seedRoyalVipPackages(client);

    const [users, balances, deposits, withdrawals, tasksToday, tasksWeek, questions, levels, recentUsers, recentDeposits, recentWithdrawals] = await Promise.all([
      client.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE is_admin = true)::int AS total_admins,
          COUNT(*) FILTER (WHERE is_banned = true)::int AS banned_users,
          COUNT(*) FILTER (WHERE is_suspicious = true)::int AS suspicious_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_users_24h,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_users_7d
        FROM users
      `),
      client.query(`
        SELECT
          COALESCE(SUM(balance_usdt),0) AS total_balance,
          COALESCE(SUM(recharge_balance_usdt),0) AS total_recharge_balance,
          COALESCE(SUM(withdrawable_usdt),0) AS total_withdrawable,
          COALESCE(SUM(earnings_balance_usdt),0) AS total_earnings
        FROM users
      `),
      client.query(`
        SELECT
          COUNT(*)::int AS total_deposits,
          COALESCE(SUM(amount_usdt),0) AS total_deposited,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS deposits_24h,
          COALESCE(SUM(amount_usdt) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'),0) AS deposited_24h,
          COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed_deposits,
          COUNT(*) FILTER (WHERE COALESCE(sweep_status,'pending') <> 'swept')::int AS pending_collection
        FROM deposits
      `),
      client.query(`
        SELECT
          COUNT(*)::int AS total_withdrawals,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending_withdrawals,
          COUNT(*) FILTER (WHERE status='paid')::int AS paid_withdrawals,
          COALESCE(SUM(amount_requested),0) AS total_requested,
          COALESCE(SUM(amount_to_receive) FILTER (WHERE status='paid'),0) AS total_paid,
          COALESCE(SUM(amount_to_receive) FILTER (WHERE status='pending'),0) AS pending_amount
        FROM withdrawals
      `),
      client.query(`
        SELECT
          COUNT(*)::int AS total_responses,
          COALESCE(SUM(reward_usdt),0) AS total_rewards,
          COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct_responses
        FROM ai_task_responses
        WHERE completed_at >= date_trunc('day', NOW())
          AND completed_at < date_trunc('day', NOW()) + INTERVAL '1 day'
      `),
      client.query(`
        SELECT
          COUNT(*)::int AS total_responses,
          COALESCE(SUM(reward_usdt),0) AS total_rewards,
          COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct_responses
        FROM ai_task_responses
        WHERE completed_at >= date_trunc('week', NOW())
          AND completed_at < date_trunc('week', NOW()) + INTERVAL '7 days'
      `),
      client.query(`
        SELECT
          COUNT(*)::int AS total_questions,
          COUNT(*) FILTER (WHERE is_active = true)::int AS active_questions
        FROM ai_task_questions
      `),
      client.query(`
        SELECT p.level, p.name, p.price_usdt, p.daily_tasks, p.task_reward_usdt,
          CASE WHEN p.level = 0 THEN (
            SELECT COUNT(*)::int FROM users u
            WHERE NOT EXISTS (
              SELECT 1 FROM vip_purchases vp
              WHERE vp.user_id = u.id AND vp.status='active' AND vp.expires_at > NOW() AND vp.level >= 1
            )
          ) ELSE COUNT(v.id)::int END AS active_users
        FROM vip_packages p
        LEFT JOIN vip_purchases v ON v.level = p.level AND v.status='active' AND v.expires_at > NOW()
        GROUP BY p.level, p.name, p.price_usdt, p.daily_tasks, p.task_reward_usdt
        ORDER BY p.level ASC
      `),
      client.query(`SELECT id,email,is_admin,is_banned,is_suspicious,created_at,withdrawable_usdt FROM users ORDER BY created_at DESC LIMIT 8`),
      client.query(`
        SELECT d.id,d.amount_usdt,d.network,d.status,d.sweep_status,d.created_at,u.email
        FROM deposits d JOIN users u ON u.id=d.user_id
        ORDER BY d.created_at DESC LIMIT 8
      `),
      client.query(`
        SELECT w.id,w.amount_requested,w.amount_to_receive,w.network,w.status,w.created_at,u.email
        FROM withdrawals w JOIN users u ON u.id=w.user_id
        ORDER BY w.created_at DESC LIMIT 8
      `),
    ]);

    const today = tasksToday.rows[0] || {};
    const week = tasksWeek.rows[0] || {};
    const weekTotal = intValue(week.total_responses);
    const weekAccuracy = weekTotal ? Number(((intValue(week.correct_responses) / weekTotal) * 100).toFixed(2)) : 0;
    const todayTotal = intValue(today.total_responses);
    const todayAccuracy = todayTotal ? Number(((intValue(today.correct_responses) / todayTotal) * 100).toFixed(2)) : 0;

    return res.json({
      stats: {
        users: users.rows[0],
        balances: {
          totalBalance: money(balances.rows[0]?.total_balance),
          totalRechargeBalance: money(balances.rows[0]?.total_recharge_balance),
          totalWithdrawable: money(balances.rows[0]?.total_withdrawable),
          totalEarnings: money(balances.rows[0]?.total_earnings),
        },
        deposits: {
          totalDeposits: intValue(deposits.rows[0]?.total_deposits),
          totalDeposited: money(deposits.rows[0]?.total_deposited),
          deposits24h: intValue(deposits.rows[0]?.deposits_24h),
          deposited24h: money(deposits.rows[0]?.deposited_24h),
          confirmedDeposits: intValue(deposits.rows[0]?.confirmed_deposits),
          pendingCollection: intValue(deposits.rows[0]?.pending_collection),
        },
        withdrawals: {
          totalWithdrawals: intValue(withdrawals.rows[0]?.total_withdrawals),
          pendingWithdrawals: intValue(withdrawals.rows[0]?.pending_withdrawals),
          paidWithdrawals: intValue(withdrawals.rows[0]?.paid_withdrawals),
          totalRequested: money(withdrawals.rows[0]?.total_requested),
          totalPaid: money(withdrawals.rows[0]?.total_paid),
          pendingAmount: money(withdrawals.rows[0]?.pending_amount),
        },
        tasks: {
          todayResponses: todayTotal,
          todayRewards: money(today.total_rewards),
          todayAccuracy,
          weekResponses: weekTotal,
          weekRewards: money(week.total_rewards),
          weekAccuracy,
          totalQuestions: intValue(questions.rows[0]?.total_questions),
          activeQuestions: intValue(questions.rows[0]?.active_questions),
        },
      },
      levels: levels.rows.map((row) => ({
        level: row.level,
        name: row.name,
        priceUsdt: money(row.price_usdt),
        dailyTasks: intValue(row.daily_tasks),
        taskRewardUsdt: money(row.task_reward_usdt),
        activeUsers: intValue(row.active_users),
      })),
      recent: {
        users: recentUsers.rows,
        deposits: recentDeposits.rows,
        withdrawals: recentWithdrawals.rows,
      },
    });
  } catch (error) {
    console.error("ADMIN OVERVIEW ERROR:", error);
    return res.status(500).json({ message: "Error al cargar panel admin.", detail: error.message });
  } finally {
    client.release();
  }
}

async function listAdminUsers(req, res) {
  try {
    const limit = getLimit(req.query.limit, 25, 100);
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = getOffset(page, limit);
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "all");
    const levelRaw = req.query.level;
    const level = levelRaw === undefined || levelRaw === "" ? null : Number(levelRaw);

    const where = [];
    const params = [];
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`LOWER(u.email) LIKE $${params.length}`);
    }
    if (status === "admin") where.push(`u.is_admin = true`);
    if (status === "banned") where.push(`u.is_banned = true`);
    if (status === "suspicious") where.push(`u.is_suspicious = true`);
    if (status === "normal") where.push(`u.is_admin = false AND u.is_banned = false AND u.is_suspicious = false`);
    if (level !== null && Number.isFinite(level)) {
      params.push(level);
      where.push(`COALESCE(active_vip.active_level,0) = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const dataParams = [...params, limit, offset];
    const countParams = [...params];

    const baseSql = `
      FROM users u
      LEFT JOIN LATERAL (
        SELECT MAX(level)::int AS active_level
        FROM vip_purchases
        WHERE user_id = u.id AND status='active' AND expires_at > NOW()
      ) active_vip ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS responses,
               COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct,
               COALESCE(SUM(reward_usdt),0) AS rewards
        FROM ai_task_responses
        WHERE user_id = u.id
          AND completed_at >= date_trunc('week', NOW())
          AND completed_at < date_trunc('week', NOW()) + INTERVAL '7 days'
      ) task_week ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS direct_count
        FROM users u2
        WHERE u2.referred_by_id = u.id
      ) refs ON true
      ${whereSql}
    `;

    const [countResult, usersResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total ${baseSql}`, countParams),
      pool.query(
        `
        SELECT
          u.id,u.email,u.referral_code,u.referred_by_id,u.created_at,u.balance_usdt,u.recharge_balance_usdt,
          u.withdrawable_usdt,u.earnings_balance_usdt,u.is_admin,u.is_banned,u.banned_reason,
          u.is_suspicious,u.suspicious_reason,u.register_ip,u.last_login_ip,u.last_login_at,
          u.full_name,u.phone_country_code,u.phone_number,COALESCE(u.roulette_points,0) AS roulette_points,COALESCE(u.withdraw_enabled,false) AS withdraw_enabled,
          COALESCE(active_vip.active_level,0) AS active_level,
          COALESCE(task_week.responses,0) AS week_responses,
          COALESCE(task_week.correct,0) AS week_correct,
          COALESCE(task_week.rewards,0) AS week_rewards,
          COALESCE(refs.direct_count,0) AS direct_count
        ${baseSql}
        ORDER BY u.created_at DESC
        LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
        `,
        dataParams
      ),
    ]);

    return res.json({
      users: usersResult.rows.map((row) => ({
        ...row,
        balance_usdt: money(row.balance_usdt),
        recharge_balance_usdt: money(row.recharge_balance_usdt),
        withdrawable_usdt: money(row.withdrawable_usdt),
        earnings_balance_usdt: money(row.earnings_balance_usdt),
        week_rewards: money(row.week_rewards),
        week_accuracy: intValue(row.week_responses) ? Number(((intValue(row.week_correct) / intValue(row.week_responses)) * 100).toFixed(2)) : 0,
      })),
      pagination: { page, limit, total: intValue(countResult.rows[0]?.total) },
    });
  } catch (error) {
    console.error("ADMIN USERS ERROR:", error);
    return res.status(500).json({ message: "Error al listar usuarios.", detail: error.message });
  }
}

async function getAdminUserDetail(req, res) {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  try {
    const [user, deposits, withdrawals, tasks, ledger, referrals, withdrawalAccounts] = await Promise.all([
      pool.query(`SELECT id,email,referral_code,referred_by_id,created_at,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt,is_admin,is_banned,banned_reason,is_suspicious,suspicious_reason,register_ip,last_login_ip,last_login_at,full_name,phone_country_iso,phone_country_name,phone_country_code,phone_number,COALESCE(roulette_points,0) AS roulette_points,COALESCE(withdraw_enabled,false) AS withdraw_enabled,withdraw_enabled_at,withdraw_enabled_note FROM users WHERE id=$1`, [userId]),
      pool.query(`SELECT id,network,amount_usdt,status,sweep_status,tx_hash,created_at FROM deposits WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]),
      pool.query(`SELECT id,network,amount_requested,amount_to_receive,status,tx_hash,created_at,paid_at FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]),
      pool.query(`
        SELECT r.id,r.selected_option,r.correct_option,r.is_correct,r.reward_usdt,r.completed_at,q.title,q.category,q.asset
        FROM ai_task_responses r JOIN ai_task_questions q ON q.id=r.question_id
        WHERE r.user_id=$1 ORDER BY r.completed_at DESC LIMIT 30
      `, [userId]),
      pool.query(`SELECT id,balance_type,direction,type,title,amount_usdt,status,created_at FROM account_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [userId]),
      pool.query(`SELECT id,email,created_at,is_banned,is_suspicious FROM users WHERE referred_by_id=$1 ORDER BY created_at DESC LIMIT 30`, [userId]),
      pool.query(`SELECT id,network,label,withdrawal_address,is_default,created_at,updated_at FROM user_withdrawal_accounts WHERE user_id=$1 ORDER BY is_default DESC, network ASC`, [userId]),
    ]);
    if (!user.rows.length) return res.status(404).json({ message: "Usuario no encontrado." });
    return res.json({ user: user.rows[0], deposits: deposits.rows, withdrawals: withdrawals.rows, tasks: tasks.rows, ledger: ledger.rows, referrals: referrals.rows, withdrawalAccounts: withdrawalAccounts.rows });
  } catch (error) {
    console.error("ADMIN USER DETAIL ERROR:", error);
    return res.status(500).json({ message: "Error al cargar detalle de usuario.", detail: error.message });
  }
}

async function updateAdminUser(req, res) {
  const userId = Number(req.params.userId);
  const adminId = req.user.userId;
  const { isSuspicious, suspiciousReason, isBanned, bannedReason, isAdmin, withdrawEnabled, withdrawEnabledNote } = req.body || {};
  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  try {
    const result = await pool.query(
      `
      UPDATE users
      SET
        is_suspicious = COALESCE($1, is_suspicious),
        suspicious_reason = CASE WHEN $1 IS NULL THEN suspicious_reason WHEN $1 = true THEN NULLIF($2,'') ELSE NULL END,
        suspicious_at = CASE WHEN $1 = true THEN NOW() WHEN $1 = false THEN NULL ELSE suspicious_at END,
        is_banned = COALESCE($3, is_banned),
        banned_reason = CASE WHEN $3 IS NULL THEN banned_reason WHEN $3 = true THEN NULLIF($4,'') ELSE NULL END,
        banned_at = CASE WHEN $3 = true THEN NOW() WHEN $3 = false THEN NULL ELSE banned_at END,
        banned_by = CASE WHEN $3 = true THEN $6 WHEN $3 = false THEN NULL ELSE banned_by END,
        is_admin = COALESCE($5, is_admin),
        withdraw_enabled = COALESCE($8, withdraw_enabled),
        withdraw_enabled_at = CASE WHEN $8 = true THEN NOW() WHEN $8 = false THEN NULL ELSE withdraw_enabled_at END,
        withdraw_enabled_by = CASE WHEN $8 = true THEN $6 WHEN $8 = false THEN NULL ELSE withdraw_enabled_by END,
        withdraw_enabled_note = CASE WHEN $8 IS NULL THEN withdraw_enabled_note ELSE NULLIF($9,'') END
      WHERE id=$7
      RETURNING id,email,is_admin,is_banned,banned_reason,is_suspicious,suspicious_reason,withdraw_enabled,withdraw_enabled_at,withdraw_enabled_note
      `,
      [isSuspicious, suspiciousReason || null, isBanned, bannedReason || null, isAdmin, adminId, userId, withdrawEnabled, withdrawEnabledNote || null]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Usuario no encontrado." });
    await pool.query(
      `INSERT INTO user_security_events(user_id,event_type,reason,created_by,metadata) VALUES ($1,'ADMIN_USER_UPDATE',$2,$3,$4::jsonb)`,
      [userId, "Actualización realizada desde panel admin.", adminId, JSON.stringify({ isSuspicious, isBanned, isAdmin, withdrawEnabled })]
    ).catch(() => {});
    return res.json({ message: "Usuario actualizado.", user: result.rows[0] });
  } catch (error) {
    console.error("ADMIN UPDATE USER ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar usuario.", detail: error.message });
  }
}

async function adjustAdminUserBalance(req, res) {
  const userId = Number(req.params.userId);
  const adminId = req.user.userId;
  const { balanceType, direction, amountUsdt, reason } = req.body || {};

  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  if (!['recharge', 'withdrawable'].includes(balanceType)) {
    return res.status(400).json({ message: "Selecciona un saldo válido: recarga o retirable." });
  }
  if (!['credit', 'debit'].includes(direction)) {
    return res.status(400).json({ message: "Selecciona una operación válida: sumar o descontar." });
  }

  const amount = Number(amountUsdt);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "Ingresa un monto mayor a 0." });
  }
  if (amount > 1000000) {
    return res.status(400).json({ message: "Monto demasiado alto para un ajuste manual." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `SELECT id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt FROM users WHERE id=$1 FOR UPDATE`,
      [userId]
    );
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Usuario no encontrado." });
    }
    const user = userResult.rows[0];

    const currentRecharge = Number(user.recharge_balance_usdt || 0);
    const currentBalance = Number(user.balance_usdt || 0);
    const currentWithdrawable = Number(user.withdrawable_usdt || 0);
    const currentEarnings = Number(user.earnings_balance_usdt || 0);

    if (direction === 'debit') {
      if (balanceType === 'recharge' && currentRecharge < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: "El usuario no tiene suficiente saldo de recarga para descontar." });
      }
      if (balanceType === 'withdrawable' && currentWithdrawable < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: "El usuario no tiene suficiente saldo retirable para descontar." });
      }
    }

    let updateSql;
    let ledgerBalanceType;
    let title;
    if (balanceType === 'recharge') {
      ledgerBalanceType = 'recharge';
      title = direction === 'credit' ? 'Recarga manual admin' : 'Descuento manual de recarga';
      updateSql = direction === 'credit'
        ? `UPDATE users SET balance_usdt=COALESCE(balance_usdt,0)+$1, recharge_balance_usdt=COALESCE(recharge_balance_usdt,0)+$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt`
        : `UPDATE users SET balance_usdt=GREATEST(COALESCE(balance_usdt,0)-$1,0), recharge_balance_usdt=COALESCE(recharge_balance_usdt,0)-$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt`;
    } else {
      ledgerBalanceType = 'withdrawable';
      title = direction === 'credit' ? 'Retirable manual admin' : 'Descuento manual de retirable';
      updateSql = direction === 'credit'
        ? `UPDATE users SET withdrawable_usdt=COALESCE(withdrawable_usdt,0)+$1, earnings_balance_usdt=COALESCE(earnings_balance_usdt,0)+$1 WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt`
        : `UPDATE users SET withdrawable_usdt=COALESCE(withdrawable_usdt,0)-$1, earnings_balance_usdt=GREATEST(COALESCE(earnings_balance_usdt,0)-$1,0) WHERE id=$2 RETURNING id,email,balance_usdt,recharge_balance_usdt,withdrawable_usdt,earnings_balance_usdt`;
    }

    const updated = await client.query(updateSql, [amount, userId]);
    const ledger = await client.query(
      `INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
       VALUES ($1,$2,$3,'admin_balance_adjustment',$4,$5,$6,'admin_user',$7,$8::jsonb,'completed')
       RETURNING id,created_at`,
      [
        userId,
        ledgerBalanceType,
        direction,
        title,
        amount,
        reason || 'Ajuste manual realizado desde panel administrativo Royal Imperial AI.',
        adminId,
        JSON.stringify({
          adminId,
          balanceType,
          direction,
          previous: {
            balance_usdt: currentBalance,
            recharge_balance_usdt: currentRecharge,
            withdrawable_usdt: currentWithdrawable,
            earnings_balance_usdt: currentEarnings,
          },
        }),
      ]
    );

    await client.query(
      `INSERT INTO user_security_events(user_id,event_type,reason,created_by,metadata)
       VALUES ($1,'ADMIN_BALANCE_ADJUSTMENT',$2,$3,$4::jsonb)`,
      [userId, `${title}: ${amount} USDT.`, adminId, JSON.stringify({ balanceType, direction, amount, ledgerId: ledger.rows[0].id })]
    ).catch(() => {});

    await client.query('COMMIT');
    return res.json({
      message: direction === 'credit' ? 'Saldo añadido correctamente.' : 'Saldo descontado correctamente.',
      user: updated.rows[0],
      ledgerId: ledger.rows[0].id,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ADMIN BALANCE ADJUSTMENT ERROR:', error);
    return res.status(500).json({ message: 'Error al ajustar saldo del usuario.', detail: error.message });
  } finally {
    client.release();
  }
}

async function listAdminTasks(req, res) {
  try {
    const limit = getLimit(req.query.limit, 50, 200);
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = getOffset(page, limit);
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "all");
    const levelRaw = req.query.level;
    const level = levelRaw === undefined || levelRaw === "" ? null : Number(levelRaw);
    const active = String(req.query.active || "all");

    const where = [];
    const params = [];
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(LOWER(q.title) LIKE $${params.length} OR LOWER(q.question) LIKE $${params.length} OR LOWER(q.asset) LIKE $${params.length})`);
    }
    if (category !== "all") { params.push(category); where.push(`q.category=$${params.length}`); }
    if (level !== null && Number.isFinite(level)) { params.push(level); where.push(`q.level_min=$${params.length}`); }
    if (active === "true") where.push(`q.is_active=true`);
    if (active === "false") where.push(`q.is_active=false`);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const baseSql = `
      FROM ai_task_questions q
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS response_count, COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct_count
        FROM ai_task_responses r WHERE r.question_id=q.id
      ) s ON true
      ${whereSql}
    `;
    const dataParams = [...params, limit, offset];
    const [count, rows] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total ${baseSql}`, params),
      pool.query(
        `SELECT q.*, COALESCE(s.response_count,0) AS response_count, COALESCE(s.correct_count,0) AS correct_count ${baseSql} ORDER BY q.id DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams
      ),
    ]);
    return res.json({ questions: rows.rows.map(buildQuestion), pagination: { page, limit, total: intValue(count.rows[0]?.total) } });
  } catch (error) {
    console.error("ADMIN TASKS ERROR:", error);
    return res.status(500).json({ message: "Error al listar tareas IA.", detail: error.message });
  }
}

async function createAdminTask(req, res) {
  const body = req.body || {};
  const required = ["title", "question", "optionA", "optionB", "optionC", "correctOption"];
  for (const key of required) if (!String(body[key] || "").trim()) return res.status(400).json({ message: `Falta el campo ${key}.` });
  const correct = String(body.correctOption).trim().toUpperCase();
  if (!["A", "B", "C"].includes(correct)) return res.status(400).json({ message: "La respuesta correcta debe ser A, B o C." });
  try {
    const result = await pool.query(
      `
      INSERT INTO ai_task_questions(level_min,category,asset,chart_type,title,question,option_a,option_b,option_c,correct_option,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
      RETURNING *
      `,
      [Number(body.levelMin ?? 1), body.category || "trend", body.asset || "MARKET", body.chartType || null, body.title, body.question, body.optionA, body.optionB, body.optionC, correct]
    );
    return res.status(201).json({ message: "Tarea creada.", question: buildQuestion({ ...result.rows[0], response_count: 0, correct_count: 0 }) });
  } catch (error) {
    console.error("ADMIN CREATE TASK ERROR:", error);
    return res.status(500).json({ message: "Error al crear tarea.", detail: error.message });
  }
}

async function updateAdminTask(req, res) {
  const questionId = Number(req.params.questionId);
  if (!questionId) return res.status(400).json({ message: "Tarea inválida." });
  const body = req.body || {};
  const correct = body.correctOption ? String(body.correctOption).trim().toUpperCase() : null;
  if (correct && !["A", "B", "C"].includes(correct)) return res.status(400).json({ message: "La respuesta correcta debe ser A, B o C." });
  try {
    const result = await pool.query(
      `
      UPDATE ai_task_questions
      SET
        level_min=COALESCE($1,level_min),
        category=COALESCE($2,category),
        asset=COALESCE($3,asset),
        chart_type=COALESCE($4,chart_type),
        title=COALESCE($5,title),
        question=COALESCE($6,question),
        option_a=COALESCE($7,option_a),
        option_b=COALESCE($8,option_b),
        option_c=COALESCE($9,option_c),
        correct_option=COALESCE($10,correct_option),
        is_active=COALESCE($11,is_active)
      WHERE id=$12
      RETURNING *
      `,
      [body.levelMin ?? null, body.category ?? null, body.asset ?? null, body.chartType ?? null, body.title ?? null, body.question ?? null, body.optionA ?? null, body.optionB ?? null, body.optionC ?? null, correct, body.isActive ?? null, questionId]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Tarea no encontrada." });
    return res.json({ message: "Tarea actualizada.", question: buildQuestion({ ...result.rows[0], response_count: 0, correct_count: 0 }) });
  } catch (error) {
    console.error("ADMIN UPDATE TASK ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar tarea.", detail: error.message });
  }
}

async function listAdminLevels(req, res) {
  const client = await pool.connect();
  try {
    await seedRoyalVipPackages(client);
    const result = await client.query(`
      SELECT p.*,
        CASE WHEN p.level = 0 THEN (
          SELECT COUNT(*)::int FROM users u
          WHERE NOT EXISTS (
            SELECT 1 FROM vip_purchases vp
            WHERE vp.user_id = u.id AND vp.status='active' AND vp.expires_at > NOW() AND vp.level >= 1
          )
        ) ELSE COUNT(v.id)::int END AS active_users,
        COALESCE(SUM(v.price_usdt),0) AS active_volume
      FROM vip_packages p
      LEFT JOIN vip_purchases v ON v.level=p.level AND v.status='active' AND v.expires_at > NOW()
      GROUP BY p.id
      ORDER BY p.level ASC
    `);
    return res.json({ levels: result.rows.map((row) => ({ ...row, price_usdt: money(row.price_usdt), daily_income_usdt: money(row.daily_income_usdt), task_reward_usdt: money(row.task_reward_usdt), active_volume: money(row.active_volume) })) });
  } catch (error) {
    console.error("ADMIN LEVELS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar niveles.", detail: error.message });
  } finally { client.release(); }
}

async function updateAdminLevel(req, res) {
  const level = Number(req.params.level);
  const body = req.body || {};
  if (!Number.isInteger(level) || level < 0) return res.status(400).json({ message: "Nivel inválido." });
  try {
    const result = await pool.query(
      `
      UPDATE vip_packages
      SET
        name=COALESCE($1,name),
        price_usdt=COALESCE($2,price_usdt),
        task_reward_usdt=COALESCE($3,task_reward_usdt),
        task_cooldown_seconds=COALESCE($4,task_cooldown_seconds),
        task_cooldown_minutes=CASE WHEN $4::int IS NULL THEN task_cooldown_minutes ELSE CEIL($4::numeric/60) END,
        daily_tasks=COALESCE($5,daily_tasks),
        valid_days=COALESCE($6,valid_days),
        is_purchasable=COALESCE($7,is_purchasable),
        daily_income_usdt=COALESCE($8,daily_income_usdt),
        updated_at=NOW()
      WHERE level=$9
      RETURNING *
      `,
      [body.name ?? null, body.priceUsdt ?? null, body.taskRewardUsdt ?? null, body.taskCooldownSeconds ?? null, body.dailyTasks ?? null, body.validDays ?? null, body.isPurchasable ?? null, body.dailyIncomeUsdt ?? null, level]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Nivel no encontrado." });
    return res.json({ message: "Nivel actualizado.", level: result.rows[0] });
  } catch (error) {
    console.error("ADMIN UPDATE LEVEL ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar nivel.", detail: error.message });
  }
}

async function getAdminSecurity(req, res) {
  try {
    const [events, ipGroups, suspicious, banned] = await Promise.all([
      pool.query(`
        SELECT e.*, u.email AS user_email, a.email AS admin_email
        FROM user_security_events e
        LEFT JOIN users u ON u.id=e.user_id
        LEFT JOIN users a ON a.id=e.created_by
        ORDER BY e.created_at DESC LIMIT 80
      `),
      pool.query(`
        SELECT register_ip AS ip_address, COUNT(*)::int AS accounts
        FROM users
        WHERE register_ip IS NOT NULL AND register_ip <> ''
        GROUP BY register_ip
        HAVING COUNT(*) > 1
        ORDER BY accounts DESC, register_ip ASC
        LIMIT 50
      `),
      pool.query(`SELECT id,email,suspicious_reason,suspicious_at,register_ip,last_login_ip FROM users WHERE is_suspicious=true ORDER BY suspicious_at DESC NULLS LAST LIMIT 80`),
      pool.query(`SELECT id,email,banned_reason,banned_at,register_ip,last_login_ip FROM users WHERE is_banned=true ORDER BY banned_at DESC NULLS LAST LIMIT 80`),
    ]);
    return res.json({ events: events.rows, ipGroups: ipGroups.rows, suspiciousUsers: suspicious.rows, bannedUsers: banned.rows });
  } catch (error) {
    console.error("ADMIN SECURITY ERROR:", error);
    return res.status(500).json({ message: "Error al cargar seguridad.", detail: error.message });
  }
}

function normalizeRedeemCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

async function listAdminRedeemCodes(req, res) {
  try {
    const limit = getLimit(req.query.limit, 50, 200);
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = getOffset(page, limit);
    const search = String(req.query.search || "").trim().toUpperCase();

    const params = [];
    const where = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`UPPER(c.code) LIKE $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [count, rows] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM redeem_codes c ${whereSql}`, params),
      pool.query(
        `
        SELECT
          c.id,
          c.code,
          c.balance_type,
          c.amount_usdt,
          c.max_uses,
          c.used_count,
          c.is_active,
          c.expires_at,
          c.note,
          c.created_at,
          u.email AS created_by_email
        FROM redeem_codes c
        LEFT JOIN users u ON u.id = c.created_by
        ${whereSql}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, limit, offset]
      ),
    ]);

    return res.json({ rows: rows.rows, total: count.rows[0]?.total || 0, page, limit });
  } catch (error) {
    console.error("LIST ADMIN REDEEM CODES ERROR:", error);
    return res.status(500).json({ message: "Error al cargar códigos.", detail: error.message });
  }
}

async function createAdminRedeemCode(req, res) {
  const adminId = req.user.userId;
  const code = normalizeRedeemCode(req.body?.code);
  const balanceType = String(req.body?.balanceType || req.body?.balance_type || "").trim().toLowerCase();
  const amount = Number(req.body?.amountUsdt || req.body?.amount_usdt || 0);
  const maxUses = Math.max(1, Math.floor(Number(req.body?.maxUses || req.body?.max_uses || 1)));
  const note = String(req.body?.note || "").trim().slice(0, 240);
  const expiresAtRaw = String(req.body?.expiresAt || req.body?.expires_at || "").trim();
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

  if (!code || code.length < 4) {
    return res.status(400).json({ message: "El código debe tener mínimo 4 caracteres." });
  }
  if (!["recharge", "withdrawable"].includes(balanceType)) {
    return res.status(400).json({ message: "Selecciona saldo de garantía o saldo retirable." });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "Ingresa un monto válido." });
  }
  if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 100000) {
    return res.status(400).json({ message: "Ingresa un límite de usos válido." });
  }
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return res.status(400).json({ message: "Fecha de vencimiento inválida." });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO redeem_codes(code,balance_type,amount_usdt,max_uses,note,expires_at,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [code, balanceType, amount, maxUses, note || null, expiresAt ? expiresAt.toISOString() : null, adminId]
    );

    return res.status(201).json({ message: "Código creado correctamente.", code: result.rows[0] });
  } catch (error) {
    console.error("CREATE ADMIN REDEEM CODE ERROR:", error);
    if (String(error.code) === "23505") {
      return res.status(409).json({ message: "Ese código ya existe." });
    }
    return res.status(500).json({ message: "Error al crear código.", detail: error.message });
  }
}

async function updateAdminRedeemCode(req, res) {
  const codeId = Number(req.params.codeId);
  const { isActive } = req.body || {};
  if (!codeId) return res.status(400).json({ message: "Código inválido." });

  try {
    const result = await pool.query(
      `
      UPDATE redeem_codes
      SET is_active = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [Boolean(isActive), codeId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Código no encontrado." });
    }

    return res.json({ message: Boolean(isActive) ? "Código habilitado." : "Código deshabilitado.", code: result.rows[0] });
  } catch (error) {
    console.error("UPDATE ADMIN REDEEM CODE ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar código.", detail: error.message });
  }
}

async function listAdminRedeemRedemptions(req, res) {
  const codeId = Number(req.params.codeId);
  if (!codeId) return res.status(400).json({ message: "Código inválido." });

  try {
    const result = await pool.query(
      `
      SELECT r.id, r.amount_usdt, r.balance_type, r.created_at, u.email, u.referral_code
      FROM redeem_code_redemptions r
      JOIN users u ON u.id = r.user_id
      WHERE r.code_id = $1
      ORDER BY r.created_at DESC
      LIMIT 80
      `,
      [codeId]
    );
    return res.json({ rows: result.rows });
  } catch (error) {
    console.error("LIST ADMIN REDEEM REDEMPTIONS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar usos del código.", detail: error.message });
  }
}

async function listAdminRoulettePrizes(req, res) {
  const client = await pool.connect();
  try {
    await ensureRouletteSchema(client);
    const result = await client.query(`SELECT * FROM roulette_prizes ORDER BY sort_order ASC, id ASC`);
    return res.json({ prizes: result.rows.map(normalizePrize) });
  } catch (error) {
    console.error("LIST ADMIN ROULETTE PRIZES ERROR:", error);
    return res.status(500).json({ message: "Error al cargar premios de ruleta.", detail: error.message });
  } finally {
    client.release();
  }
}

async function createAdminRoulettePrize(req, res) {
  const body = req.body || {};
  const label = String(body.label || "").trim();
  const prizeType = String(body.prizeType || body.prize_type || "withdrawable").trim();
  const amountUsdt = Number(body.amountUsdt || body.amount_usdt || 0);
  const creditPoints = Number(body.creditPoints || body.credit_points || 0);
  const probabilityWeight = Number(body.probabilityWeight || body.probability_weight || 0);
  const colorKey = String(body.colorKey || body.color_key || "gold").trim();
  const sortOrder = Number(body.sortOrder || body.sort_order || 0);
  const isActive = body.isActive !== false && body.is_active !== false;

  if (!label) return res.status(400).json({ message: "Ingresa nombre del premio." });
  if (!["withdrawable","recharge","credit_points","none"].includes(prizeType)) return res.status(400).json({ message: "Tipo de premio inválido." });
  if (!Number.isFinite(probabilityWeight) || probabilityWeight < 0) return res.status(400).json({ message: "Probabilidad inválida." });
  if (!Number.isFinite(amountUsdt) || amountUsdt < 0) return res.status(400).json({ message: "Monto inválido." });

  const client = await pool.connect();
  try {
    await ensureRouletteSchema(client);
    const result = await client.query(
      `
      INSERT INTO roulette_prizes(label,prize_type,amount_usdt,credit_points,probability_weight,color_key,sort_order,is_active,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      RETURNING *
      `,
      [label, prizeType, amountUsdt, Math.max(0, Math.floor(creditPoints || 0)), probabilityWeight, colorKey || "gold", Number.isFinite(sortOrder) ? sortOrder : 0, isActive]
    );
    return res.status(201).json({ message: "Premio creado.", prize: normalizePrize(result.rows[0]) });
  } catch (error) {
    console.error("CREATE ADMIN ROULETTE PRIZE ERROR:", error);
    return res.status(500).json({ message: "Error al crear premio.", detail: error.message });
  } finally {
    client.release();
  }
}

async function updateAdminRoulettePrize(req, res) {
  const id = Number(req.params.prizeId);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: "Premio inválido." });

  const client = await pool.connect();
  try {
    await ensureRouletteSchema(client);
    const current = await client.query(`SELECT * FROM roulette_prizes WHERE id=$1`, [id]);
    if (!current.rows.length) return res.status(404).json({ message: "Premio no encontrado." });
    const row = current.rows[0];

    const label = body.label !== undefined ? String(body.label || "").trim() : row.label;
    const prizeType = body.prizeType !== undefined || body.prize_type !== undefined ? String(body.prizeType || body.prize_type || row.prize_type).trim() : row.prize_type;
    const amountUsdt = body.amountUsdt !== undefined || body.amount_usdt !== undefined ? Number(body.amountUsdt ?? body.amount_usdt) : Number(row.amount_usdt || 0);
    const creditPoints = body.creditPoints !== undefined || body.credit_points !== undefined ? Number(body.creditPoints ?? body.credit_points) : Number(row.credit_points || 0);
    const probabilityWeight = body.probabilityWeight !== undefined || body.probability_weight !== undefined ? Number(body.probabilityWeight ?? body.probability_weight) : Number(row.probability_weight || 0);
    const colorKey = body.colorKey !== undefined || body.color_key !== undefined ? String(body.colorKey || body.color_key || "gold").trim() : row.color_key;
    const sortOrder = body.sortOrder !== undefined || body.sort_order !== undefined ? Number(body.sortOrder ?? body.sort_order) : Number(row.sort_order || 0);
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : body.is_active !== undefined ? Boolean(body.is_active) : row.is_active;

    if (!label) return res.status(400).json({ message: "Ingresa nombre del premio." });
    if (!["withdrawable","recharge","credit_points","none"].includes(prizeType)) return res.status(400).json({ message: "Tipo de premio inválido." });
    if (!Number.isFinite(probabilityWeight) || probabilityWeight < 0) return res.status(400).json({ message: "Probabilidad inválida." });
    if (!Number.isFinite(amountUsdt) || amountUsdt < 0) return res.status(400).json({ message: "Monto inválido." });

    const result = await client.query(
      `
      UPDATE roulette_prizes
      SET label=$2, prize_type=$3, amount_usdt=$4, credit_points=$5, probability_weight=$6, color_key=$7, sort_order=$8, is_active=$9, updated_at=NOW()
      WHERE id=$1
      RETURNING *
      `,
      [id, label, prizeType, amountUsdt, Math.max(0, Math.floor(creditPoints || 0)), probabilityWeight, colorKey || "gold", Number.isFinite(sortOrder) ? sortOrder : 0, isActive]
    );

    return res.json({ message: "Premio actualizado.", prize: normalizePrize(result.rows[0]) });
  } catch (error) {
    console.error("UPDATE ADMIN ROULETTE PRIZE ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar premio.", detail: error.message });
  } finally {
    client.release();
  }
}

async function listAdminRouletteSpins(req, res) {
  const client = await pool.connect();
  try {
    await ensureRouletteSchema(client);
    const limit = getLimit(req.query.limit, 50, 200);
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = getOffset(page, limit);
    const [count, result] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM roulette_spins`),
      client.query(
        `
        SELECT s.*, u.email, u.referral_code
        FROM roulette_spins s
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC
        LIMIT $1 OFFSET $2
        `,
        [limit, offset]
      ),
    ]);
    return res.json({ spins: result.rows.map(normalizeSpin), pagination: { page, limit, total: intValue(count.rows[0]?.total) } });
  } catch (error) {
    console.error("LIST ADMIN ROULETTE SPINS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar historial de ruleta.", detail: error.message });
  } finally {
    client.release();
  }
}

async function adjustAdminUserRoulettePoints(req, res) {
  const userId = Number(req.params.userId);
  const adminId = req.user.userId;
  const { operation, points, reason } = req.body || {};
  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  if (!["add","subtract","set"].includes(operation)) return res.status(400).json({ message: "Operación inválida." });

  const qty = Math.floor(Number(points || 0));
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ message: "Ingresa puntos válidos." });
  if (qty > 100000) return res.status(400).json({ message: "Cantidad demasiado alta." });

  const client = await pool.connect();
  try {
    await ensureRouletteSchema(client);
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,email,COALESCE(roulette_points,0) AS roulette_points FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!current.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const previous = Number(current.rows[0].roulette_points || 0);
    let next = previous;
    if (operation === "add") next = previous + qty;
    if (operation === "subtract") next = Math.max(0, previous - qty);
    if (operation === "set") next = qty;

    const updated = await client.query(
      `UPDATE users SET roulette_points=$1 WHERE id=$2 RETURNING id,email,roulette_points`,
      [next, userId]
    );

    await client.query(
      `INSERT INTO user_security_events(user_id,event_type,reason,created_by,metadata)
       VALUES ($1,'ADMIN_ROULETTE_POINTS',$2,$3,$4::jsonb)`,
      [
        userId,
        reason || "Ajuste manual de puntos de ruleta.",
        adminId,
        JSON.stringify({ operation, points: qty, previous, next }),
      ]
    ).catch(() => {});

    await client.query("COMMIT");
    return res.json({ message: "Puntos de ruleta actualizados.", user: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADJUST ADMIN USER ROULETTE POINTS ERROR:", error);
    return res.status(500).json({ message: "Error al ajustar puntos.", detail: error.message });
  } finally {
    client.release();
  }
}

module.exports = {
  getAdminOverview,
  listAdminUsers,
  getAdminUserDetail,
  updateAdminUser,
  adjustAdminUserBalance,
  listAdminTasks,
  createAdminTask,
  updateAdminTask,
  listAdminLevels,
  updateAdminLevel,
  listAdminRoulettePrizes,
  createAdminRoulettePrize,
  updateAdminRoulettePrize,
  listAdminRouletteSpins,
  adjustAdminUserRoulettePoints,
  listAdminRedeemCodes,
  createAdminRedeemCode,
  updateAdminRedeemCode,
  listAdminRedeemRedemptions,
  getAdminSecurity,
};
