const pool = require("../config/db");
const { ensureGreenVestTreeSchema } = require("../services/greenVestTreeService");

function getAuthUserId(req) {
  return req.user.userId || req.user.id;
}

function buildCooldownLabel(minutes) {
  const value = Number(minutes || 0);
  if (value <= 0) return "Disponible";
  if (value % 60 === 0) {
    const hours = value / 60;
    return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  return `${value} minutos`;
}

function normalizeTreeTask(row) {
  const cooldownMinutes = Number(row.task_cooldown_minutes || 360);
  const rewardUsdt = row.task_reward_usdt || "0";
  const nextAvailableAt = row.next_available_at || null;
  const serverNow = row.server_now || null;
  const status = row.task_status;
  const level = Number(row.vip_level);

  return {
    id: row.vip_purchase_id,
    vipPurchaseId: row.vip_purchase_id,
    treePurchaseId: row.vip_purchase_id,
    vipLevel: level,
    treeLevel: level,
    title: row.package_name || (level === 0 ? "Brote de Pasantía" : `Planta Nivel ${level}`),
    packageName: row.package_name || (level === 0 ? "Brote de Pasantía" : `Planta Nivel ${level}`),
    waterName: level === 0 ? "Agua de Brote de Pasantía" : `Agua de ${row.package_name}`,
    rewardUsdt,
    taskRewardUsdt: rewardUsdt,
    waterRewardUsdt: rewardUsdt,
    dailyIncomeUsdt: row.daily_income_usdt || "0",
    cooldownMinutes,
    cooldownLabel: buildCooldownLabel(cooldownMinutes),
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    lastCompletedAt: row.last_completed_at,
    nextAvailableAt,
    serverNow,
    status,
    isAvailable: status === "available",
    isExpired: status === "expired",
    isFree: level === 0,
  };
}

async function expireOldTrees(client, userId) {
  await client.query(
    `
    UPDATE vip_purchases
    SET status = 'expired'
    WHERE user_id = $1
      AND status = 'active'
      AND expires_at <= NOW()
    `,
    [userId]
  );
}

async function getTasksDashboard(req, res) {
  const userId = getAuthUserId(req);
  const client = await pool.connect();

  try {
    await ensureGreenVestTreeSchema(client);
    await expireOldTrees(client, userId);

    const userResult = await client.query(
      `
      SELECT
        id,
        email,
        created_at,
        COALESCE(balance_usdt, 0) AS balance_usdt,
        COALESCE(withdrawable_usdt, 0) AS withdrawable_usdt
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const tasksResult = await client.query(
      `
      SELECT
        vp.id AS vip_purchase_id,
        vp.level AS vip_level,
        vp.purchased_at,
        vp.expires_at,
        vp.status AS purchase_status,
        p.name AS package_name,
        COALESCE(p.daily_income_usdt, vp.daily_income_usdt, 0) AS daily_income_usdt,
        COALESCE(p.task_reward_usdt, vp.daily_income_usdt / 4, 0) AS task_reward_usdt,
        COALESCE(p.task_cooldown_minutes, 360) AS task_cooldown_minutes,
        last_task.completed_at AS last_completed_at,
        CASE
          WHEN last_task.id IS NULL THEN vp.purchased_at + (COALESCE(p.task_cooldown_minutes, 360)::int * INTERVAL '1 minute')
          ELSE last_task.period_end
        END AS next_available_at,
        NOW() AS server_now,
        CASE
          WHEN vp.status <> 'active' OR vp.expires_at <= NOW() THEN 'expired'
          WHEN last_task.id IS NULL AND (vp.purchased_at + (COALESCE(p.task_cooldown_minutes, 360)::int * INTERVAL '1 minute')) <= NOW() THEN 'available'
          WHEN last_task.id IS NULL THEN 'cooldown'
          WHEN last_task.period_end <= NOW() THEN 'available'
          ELSE 'cooldown'
        END AS task_status
      FROM vip_purchases vp
      JOIN vip_packages p ON p.id = vp.package_id
      LEFT JOIN LATERAL (
        SELECT id, completed_at, period_end
        FROM vip_daily_tasks
        WHERE vip_purchase_id = vp.id
          AND user_id = vp.user_id
          AND status = 'completed'
        ORDER BY completed_at DESC NULLS LAST, id DESC
        LIMIT 1
      ) last_task ON TRUE
      WHERE vp.user_id = $1
        AND vp.status = 'active'
      ORDER BY vp.level ASC, vp.id ASC
      `,
      [userId]
    );

    const tasks = tasksResult.rows.map(normalizeTreeTask);
    const activeTasks = tasks.filter((task) => !task.isExpired);
    const availableTasks = activeTasks.filter((task) => task.status === "available").length;
    const cooldownTasks = activeTasks.filter((task) => task.status === "cooldown").length;

    const nearestNextAvailableAt = activeTasks
      .filter((task) => task.status === "cooldown" && task.nextAvailableAt)
      .map((task) => new Date(task.nextAvailableAt).getTime())
      .sort((a, b) => a - b)[0];

    const historyResult = await client.query(
      `
      SELECT vdt.*, p.name AS package_name
      FROM vip_daily_tasks vdt
      LEFT JOIN vip_purchases vp ON vp.id = vdt.vip_purchase_id
      LEFT JOIN vip_packages p ON p.id = vp.package_id
      WHERE vdt.user_id = $1
      ORDER BY vdt.completed_at DESC
      LIMIT 60
      `,
      [userId]
    );

    return res.json({
      user: userResult.rows[0],
      withdrawableBalanceUsdt: userResult.rows[0].withdrawable_usdt,
      serverNow: new Date().toISOString(),
      nextResetAt: nearestNextAvailableAt ? new Date(nearestNextAvailableAt).toISOString() : null,
      totalTasks: activeTasks.length,
      completedTasks: cooldownTasks,
      availableTasks,
      pendingTasks: availableTasks,
      cooldownTasks,
      tasks,
      history: historyResult.rows.map((item) => ({
        id: item.id,
        treeName: item.package_name || `Nivel ${item.vip_level}`,
        treeLevel: item.vip_level,
        rewardUsdt: item.reward_usdt,
        completedAt: item.completed_at,
        nextAvailableAt: item.period_end,
      })),
    });
  } catch (error) {
    console.error("GET TREE TASKS DASHBOARD ERROR:", error);
    return res.status(500).json({
      message: "Error al cargar agua de árboles.",
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

async function completeVipTask(req, res) {
  const userId = getAuthUserId(req);
  const { vipPurchaseId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureGreenVestTreeSchema(client);
    await expireOldTrees(client, userId);

    const vipResult = await client.query(
      `
      SELECT
        vp.id,
        vp.user_id,
        vp.level,
        vp.purchased_at,
        vp.expires_at,
        vp.status,
        p.name AS package_name,
        COALESCE(p.daily_income_usdt, vp.daily_income_usdt, 0) AS daily_income_usdt,
        COALESCE(p.task_reward_usdt, vp.daily_income_usdt / 4, 0) AS task_reward_usdt,
        COALESCE(p.task_cooldown_minutes, 360) AS task_cooldown_minutes
      FROM vip_purchases vp
      JOIN vip_packages p ON p.id = vp.package_id
      WHERE vp.id = $1
        AND vp.user_id = $2
      FOR UPDATE OF vp
      `,
      [vipPurchaseId, userId]
    );

    if (vipResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Árbol GreenVest no encontrado." });
    }

    const tree = vipResult.rows[0];

    if (tree.status !== "active" || new Date(tree.expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: tree.level === 0
          ? "Tu Pasantía ha finalizado. Planta un árbol superior para seguir generando recompensas."
          : "Este árbol GreenVest ya no está activo.",
      });
    }

    const lastTaskResult = await client.query(
      `
      SELECT id, completed_at, period_end
      FROM vip_daily_tasks
      WHERE user_id = $1
        AND vip_purchase_id = $2
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, id DESC
      LIMIT 1
      `,
      [userId, tree.id]
    );

    const lastTask = lastTaskResult.rows[0];
    const nowResult = await client.query(`SELECT NOW() AS now`);
    const serverNow = new Date(nowResult.rows[0].now);
    const firstAvailableAt = new Date(new Date(tree.purchased_at).getTime() + Number(tree.task_cooldown_minutes || 360) * 60 * 1000);
    const nextAvailableAt = lastTask ? new Date(lastTask.period_end) : firstAvailableAt;

    if (nextAvailableAt > serverNow) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "El agua de este árbol todavía está en proceso. Podrás regar cuando termine el contador.",
        nextAvailableAt: nextAvailableAt.toISOString(),
      });
    }

    const taskResult = await client.query(
      `
      INSERT INTO vip_daily_tasks
      (user_id, vip_purchase_id, vip_level, period_start, period_end, reward_usdt, status, completed_at)
      VALUES
      ($1, $2, $3, NOW(), NOW() + ($5::int * INTERVAL '1 minute'), $4, 'completed', NOW())
      RETURNING id, reward_usdt, period_start, period_end, completed_at
      `,
      [userId, tree.id, tree.level, tree.task_reward_usdt, tree.task_cooldown_minutes]
    );

    const task = taskResult.rows[0];

    await client.query(
      `
      UPDATE users
      SET
        withdrawable_usdt = COALESCE(withdrawable_usdt, 0) + $1,
        earnings_balance_usdt = COALESCE(earnings_balance_usdt, 0) + $1
      WHERE id = $2
      `,
      [task.reward_usdt, userId]
    );

    await client.query(
      `
      INSERT INTO account_ledger
      (user_id, balance_type, direction, type, title, amount_usdt, description, reference_type, reference_id, metadata, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
      ON CONFLICT DO NOTHING
      `,
      [
        userId,
        "earnings",
        "credit",
        "tree_watering",
        `Riego de ${tree.package_name}`,
        task.reward_usdt,
        `Recolectaste agua y regaste ${tree.package_name}. Próxima agua disponible luego de ${tree.task_cooldown_minutes} minutos.`,
        "vip_daily_task",
        task.id,
        JSON.stringify({
          treePurchaseId: tree.id,
          treeLevel: tree.level,
          treeName: tree.package_name,
          waterRewardUsdt: tree.task_reward_usdt,
          cooldownMinutes: tree.task_cooldown_minutes,
          nextAvailableAt: task.period_end,
        }),
        "completed",
      ]
    );

    await client.query("COMMIT");

    return res.json({
      message: `Árbol regado correctamente. Ganaste ${Number(task.reward_usdt).toFixed(3)} USDT.`,
      rewardUsdt: task.reward_usdt,
      completedAt: task.completed_at,
      nextAvailableAt: task.period_end,
      cooldownMinutes: Number(tree.task_cooldown_minutes),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("COMPLETE TREE WATERING ERROR:", error);
    return res.status(500).json({
      message: "Error al regar árbol.",
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

module.exports = {
  getTasksDashboard,
  completeVipTask,
};
