const pool = require("../config/db");
const {
  getAuthUserId,
  ensureMiningSchema,
  refreshMiningAccountForUser,
  getMiningDashboard,
} = require("../services/miningService");
const { ensureNotBanned, logSecurityEvent } = require("../services/securityService");

async function getMiningStatus(req, res) {
  try {
    const dashboard = await getMiningDashboard(req.user);
    return res.json(dashboard);
  } catch (error) {
    console.error("GET MINING STATUS ERROR:", error);
    return res.status(500).json({
      message: "Error al cargar tareas.",
      detail: error.message,
    });
  }
}

async function claimMiningReward(req, res) {
  const userId = getAuthUserId(req);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const restriction = await ensureNotBanned(client, userId, "completar minería");
    if (!restriction.ok) {
      await logSecurityEvent(client, {
        userId,
        eventType: "MINING_BLOCKED_BANNED",
        reason: restriction.message,
      });
      await client.query("ROLLBACK");
      return res.status(restriction.statusCode || 403).json({
        message: restriction.message,
        userSecurity: restriction.userSecurity,
      });
    }

    await ensureMiningSchema(client);

    const refreshed = await refreshMiningAccountForUser(client, req.user);
    const account = refreshed?.account;
    const plan = refreshed?.plan;
    const resolvedUserId = refreshed?.user?.id || userId;

    if (!account || !plan || account.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Necesitas una inversión mínima activa para iniciar tu plan GreenVest." });
    }

    const accountResult = await client.query(
      `SELECT * FROM mining_accounts WHERE user_id = $1 FOR UPDATE`,
      [resolvedUserId]
    );

    const lockedAccount = accountResult.rows[0];

    if (!lockedAccount || lockedAccount.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Plan GreenVest no activo." });
    }

    const nowResult = await client.query(`SELECT NOW() AS now`);
    const serverNow = new Date(nowResult.rows[0].now);
    const cycleEndsAt = new Date(lockedAccount.cycle_ends_at);

    if (cycleEndsAt > serverNow) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Tu tarea diaria todavía está en progreso. Reclama cuando llegue al 100%.",
        cycleEndsAt: lockedAccount.cycle_ends_at,
        serverNow: serverNow.toISOString(),
      });
    }

    const rewardAmount = lockedAccount.daily_reward;

    const claimResult = await client.query(
      `
      INSERT INTO mining_claims
      (user_id, mining_account_id, plan_id, invested_amount, daily_percent, reward_amount, cycle_started_at, cycle_ends_at, claimed_at, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),'claimed')
      RETURNING *
      `,
      [
        resolvedUserId,
        lockedAccount.id,
        lockedAccount.current_plan_id,
        lockedAccount.invested_amount,
        lockedAccount.daily_percent,
        rewardAmount,
        lockedAccount.cycle_started_at,
        lockedAccount.cycle_ends_at,
      ]
    );

    const claim = claimResult.rows[0];

    await client.query(
      `
      UPDATE users
      SET withdrawable_usdt = COALESCE(withdrawable_usdt, 0) + $1,
          earnings_balance_usdt = COALESCE(earnings_balance_usdt, 0) + $1
      WHERE id = $2
      `,
      [rewardAmount, resolvedUserId]
    );

    await client.query(
      `
      INSERT INTO account_ledger
      (user_id, balance_type, direction, type, title, amount_usdt, description, reference_type, reference_id, metadata, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
      `,
      [
        resolvedUserId,
        "earnings",
        "credit",
        "mining_claim",
        `Ganancia diaria ${plan.name}`,
        rewardAmount,
        `Ganancia fija diaria por ciclo de ${plan.duration_hours} horas en ${plan.name}.`,
        "mining_claim",
        claim.id,
        JSON.stringify({
          planId: plan.id,
          planName: plan.name,
          dailyPercent: 0,
          investedAmount: lockedAccount.invested_amount,
          cycleStartedAt: lockedAccount.cycle_started_at,
          cycleEndsAt: lockedAccount.cycle_ends_at,
        }),
        "completed",
      ]
    );

    await client.query(
      `
      UPDATE mining_accounts
      SET cycle_started_at = NOW(),
          cycle_ends_at = NOW() + ($1::int * INTERVAL '1 hour'),
          last_claimed_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [plan.duration_hours, lockedAccount.id]
    );

    await client.query("COMMIT");

    const dashboard = await getMiningDashboard(req.user);
    return res.json({
      message: `Ganancia reclamada: ${Number(rewardAmount).toFixed(2)} USDT. Nuevo ciclo iniciado.`,
      rewardAmount,
      claim,
      dashboard,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CLAIM MINING REWARD ERROR:", error);
    return res.status(500).json({
      message: "Error al reclamar ganancia diaria.",
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

module.exports = { getMiningStatus, claimMiningReward };
