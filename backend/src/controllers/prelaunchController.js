const pool = require("../config/db");
const {
  ensurePrelaunchSchema,
  getPrelaunchStatus,
  getConfig,
  creditRechargeBalance,
} = require("../services/prelaunchService");

async function getStatus(req, res) {
  const userId = req.user.userId;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const status = await getPrelaunchStatus(userId, client, { refreshReferral: true });
    await client.query("COMMIT");
    if (!status) return res.status(404).json({ message: "Usuario no encontrado." });
    return res.json(status);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PRELAUNCH STATUS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar pre-lanzamiento.", detail: error.message });
  } finally {
    client.release();
  }
}

async function checkin(req, res) {
  const userId = req.user.userId;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensurePrelaunchSchema(client);

    const status = await getPrelaunchStatus(userId, client, { refreshReferral: true });
    if (!status) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (!status.canParticipate) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este beneficio no está disponible para tu cuenta." });
    }

    if (!status.withinCheckinWindow) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El check-in está disponible dentro del plazo de pre-lanzamiento." });
    }

    if (status.checkin.todayDone) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Ya completaste tu check-in de hoy." });
    }

    if (!status.checkin.canCheckin) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Check-in no disponible." });
    }

    const dayNumber = Number(status.checkin.completed || 0) + 1;
    const amount = Number(status.config.checkinRewardUsdt || 1);

    const result = await client.query(
      `
      INSERT INTO prelaunch_checkins(user_id, checkin_date, day_number, amount_usdt, status)
      VALUES ($1, $2::date, $3, $4, 'credited')
      ON CONFLICT (user_id, checkin_date) DO NOTHING
      RETURNING *
      `,
      [userId, status.todayPeru, dayNumber, amount]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Ya completaste tu check-in de hoy." });
    }

    await creditRechargeBalance(client, {
      userId,
      amount,
      type: "prelaunch_checkin",
      title: "Check-in diario pre-lanzamiento",
      description: `Check-in día ${dayNumber} de ${status.config.maxCheckinDays}.`,
      referenceType: "prelaunch_checkin",
      referenceId: result.rows[0].id,
      metadata: { dayNumber, checkinDate: status.todayPeru },
    });

    const updated = await getPrelaunchStatus(userId, client, { refreshReferral: true });
    await client.query("COMMIT");

    return res.json({
      message: `Check-in completado. +${amount.toFixed(2)} USDT en saldo de garantía.`,
      rewardUsdt: amount,
      status: updated,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PRELAUNCH CHECKIN ERROR:", error);
    return res.status(500).json({ message: "Error al registrar check-in.", detail: error.message });
  } finally {
    client.release();
  }
}

async function submitTikTok(req, res) {
  const userId = req.user.userId;
  const url = String(req.body?.url || "").trim();

  if (!/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({ message: "Ingresa un enlace válido." });
  }

  if (!/tiktok\.com/i.test(url)) {
    return res.status(400).json({ message: "Ingresa un enlace de TikTok válido." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const status = await getPrelaunchStatus(userId, client, { refreshReferral: true });
    if (!status?.canParticipate) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este beneficio no está disponible para tu cuenta." });
    }

    if (status.tiktok.status === "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Tu TikTok ya fue aprobado." });
    }

    await client.query(
      `
      INSERT INTO prelaunch_tiktok_submissions(user_id, tiktok_url, status, reward_usdt, updated_at)
      VALUES ($1, $2, 'pending', $3, CURRENT_TIMESTAMP)
      `,
      [userId, url, status.config.tiktokRewardUsdt]
    );

    const updated = await getPrelaunchStatus(userId, client, { refreshReferral: true });
    await client.query("COMMIT");

    return res.json({
      message: "TikTok enviado para revisión.",
      status: updated,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PRELAUNCH TIKTOK SUBMIT ERROR:", error);
    return res.status(500).json({ message: "Error al enviar TikTok.", detail: error.message });
  } finally {
    client.release();
  }
}

async function adminOverview(req, res) {
  try {
    await ensurePrelaunchSchema(pool);
    const config = await getConfig(pool);
    const [checkins, tiktoks, referrals] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount_usdt),0) AS amount FROM prelaunch_checkins`),
      pool.query(`SELECT status, COUNT(*)::int AS total FROM prelaunch_tiktok_submissions GROUP BY status ORDER BY status ASC`),
      pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount_usdt),0) AS amount FROM prelaunch_referral_rewards`),
    ]);
    return res.json({
      config,
      stats: {
        checkins: checkins.rows[0],
        tiktoks: tiktoks.rows,
        referrals: referrals.rows[0],
      },
    });
  } catch (error) {
    console.error("ADMIN PRELAUNCH OVERVIEW ERROR:", error);
    return res.status(500).json({ message: "Error al cargar pre-lanzamiento admin.", detail: error.message });
  }
}

async function adminListTiktoks(req, res) {
  try {
    await ensurePrelaunchSchema(pool);
    const result = await pool.query(
      `
      SELECT s.*, u.email, u.referral_code
      FROM prelaunch_tiktok_submissions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.created_at DESC
      LIMIT 100
      `
    );
    return res.json({ items: result.rows });
  } catch (error) {
    console.error("ADMIN PRELAUNCH TIKTOKS ERROR:", error);
    return res.status(500).json({ message: "Error al listar TikToks.", detail: error.message });
  }
}

async function adminReviewTikTok(req, res) {
  const submissionId = Number(req.params.submissionId);
  const status = String(req.body?.status || "").trim().toLowerCase();
  const note = String(req.body?.note || "").trim().slice(0, 300);

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Estado no válido." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensurePrelaunchSchema(client);

    const result = await client.query(
      `SELECT * FROM prelaunch_tiktok_submissions WHERE id = $1 FOR UPDATE`,
      [submissionId]
    );
    const submission = result.rows[0];
    if (!submission) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Solicitud no encontrada." });
    }

    if (submission.status === "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta solicitud ya fue aprobada." });
    }

    const approvedBefore = await client.query(
      `SELECT id FROM prelaunch_tiktok_submissions WHERE user_id = $1 AND status = 'approved' LIMIT 1`,
      [submission.user_id]
    );

    await client.query(
      `
      UPDATE prelaunch_tiktok_submissions
      SET status = $1, admin_note = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [status, note, submissionId]
    );

    if (status === "approved" && !approvedBefore.rows.length) {
      await creditRechargeBalance(client, {
        userId: submission.user_id,
        amount: Number(submission.reward_usdt || 5),
        type: "prelaunch_tiktok",
        title: "Bono pre-lanzamiento TikTok",
        description: "TikTok promocional aprobado por administrador.",
        referenceType: "prelaunch_tiktok_submission",
        referenceId: submissionId,
        metadata: { tiktokUrl: submission.tiktok_url },
      });
    }

    await client.query("COMMIT");
    return res.json({ message: status === "approved" ? "TikTok aprobado." : "TikTok rechazado." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ADMIN PRELAUNCH TIKTOK REVIEW ERROR:", error);
    return res.status(500).json({ message: "Error al revisar TikTok.", detail: error.message });
  } finally {
    client.release();
  }
}

module.exports = {
  getStatus,
  checkin,
  submitTikTok,
  adminOverview,
  adminListTiktoks,
  adminReviewTikTok,
};
