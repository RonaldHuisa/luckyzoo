const pool = require("../config/db");
const { ensureRoyalAiSchema, seedRoyalVipPackages, getLevelConfig, getCooldownLabel } = require("../services/royalAiTaskService");

function getAuthUserId(req) { return req.user.userId || req.user.id; }
function toNumber(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function todayWindowSql() {
  return `completed_at >= ((date_trunc('day', NOW() AT TIME ZONE 'America/Lima')) AT TIME ZONE 'America/Lima')
          AND completed_at < (((date_trunc('day', NOW() AT TIME ZONE 'America/Lima')) + INTERVAL '1 day') AT TIME ZONE 'America/Lima')`;
}
function nextPeruResetSql() {
  return `((date_trunc('day', NOW() AT TIME ZONE 'America/Lima') + INTERVAL '1 day') AT TIME ZONE 'America/Lima')`;
}
function weekWindowSql() { return `completed_at >= date_trunc('week', NOW()) AND completed_at < date_trunc('week', NOW()) + INTERVAL '7 day'`; }
function categoryLabel(category) {
  return ({ trend: "Tendencia", volatility: "Volatilidad", news: "Noticias", signal: "Señal IA", risk: "Riesgo", comparison: "Comparación" })[category] || "Validación IA";
}
function normalizeQuestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    levelMin: Number(row.level_min || 1),
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    asset: row.asset,
    chartType: row.chart_type,
    title: row.title,
    question: row.question,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
  };
}
async function getActiveLevel(client, userId) {
  const result = await client.query(
    `
    SELECT MAX(level)::int AS active_level
    FROM vip_purchases
    WHERE user_id = $1 AND status = 'active' AND expires_at > NOW() AND level >= 1
    `,
    [userId]
  );
  return Number(result.rows[0]?.active_level || 0);
}
async function getAccuracy(client, userId) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct
     FROM ai_task_responses WHERE user_id = $1 AND ${weekWindowSql()}`,
    [userId]
  );
  const total = Number(result.rows[0]?.total || 0);
  const correct = Number(result.rows[0]?.correct || 0);
  const percent = total ? (correct / total) * 100 : 0;
  let status = "Sin datos suficientes";
  if (total >= 5) {
    if (percent >= 90) status = "Analista Royal";
    else if (percent >= 80) status = "Analista Destacado";
    else if (percent >= 70) status = "Buen Analista";
    else if (percent >= 60) status = "Activo";
    else status = "Participante";
  }
  return { total, correct, weeklyPercent: Number(percent.toFixed(2)), status };
}
async function getLastResponse(client, userId) {
  const result = await client.query(
    `SELECT next_available_at FROM ai_task_responses WHERE user_id = $1 ORDER BY completed_at DESC, id DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}
async function getQuestionForLevel(client, userId, level) {
  const result = await client.query(
    `
    SELECT q.*
    FROM ai_task_questions q
    WHERE q.is_active = true
      AND q.level_min <= $1
      AND q.id NOT IN (
        SELECT question_id FROM ai_task_responses
        WHERE user_id = $2 AND ${todayWindowSql()}
      )
    ORDER BY q.level_min DESC, RANDOM()
    LIMIT 1
    `,
    [level, userId]
  );
  if (result.rows[0]) return normalizeQuestion(result.rows[0]);
  const fallback = await client.query(
    `SELECT * FROM ai_task_questions WHERE is_active = true AND level_min <= $1 ORDER BY RANDOM() LIMIT 1`,
    [level]
  );
  return normalizeQuestion(fallback.rows[0]);
}
async function getTasksDashboard(req, res) {
  const userId = getAuthUserId(req);
  const client = await pool.connect();
  try {
    await seedRoyalVipPackages(client);
    const userResult = await client.query(
      `SELECT id,email,COALESCE(balance_usdt,0) AS balance_usdt,COALESCE(withdrawable_usdt,0) AS withdrawable_usdt,created_at FROM users WHERE id=$1`,
      [userId]
    );
    if (!userResult.rows.length) return res.status(404).json({ message: "Usuario no encontrado." });

    const activeLevel = await getActiveLevel(client, userId);
    const cfg = getLevelConfig(activeLevel);

    const todayResult = await client.query(
      `SELECT COUNT(*)::int AS completed, COALESCE(SUM(reward_usdt),0) AS reward FROM ai_task_responses WHERE user_id=$1 AND ${todayWindowSql()}`,
      [userId]
    );
    const completed = Number(todayResult.rows[0]?.completed || 0);
    const rewardToday = todayResult.rows[0]?.reward || "0";
    const limit = cfg ? cfg.dailyTasks : 0;
    const remaining = Math.max(0, limit - completed);

    const last = await getLastResponse(client, userId);
    const nextAvailableAt = last?.next_available_at && new Date(last.next_available_at) > new Date() ? last.next_available_at : null;
    const currentQuestion = cfg && remaining > 0 && !nextAvailableAt ? await getQuestionForLevel(client, userId, activeLevel) : null;
    const accuracy = await getAccuracy(client, userId);
    const resetResult = await client.query(`SELECT ${nextPeruResetSql()} AS next_reset_at`);
    const nextResetAt = resetResult.rows[0]?.next_reset_at;

    const historyResult = await client.query(
      `
      SELECT r.id, r.selected_option, r.correct_option, r.is_correct, r.reward_usdt, r.completed_at, q.asset, q.category, q.title
      FROM ai_task_responses r
      JOIN ai_task_questions q ON q.id = r.question_id
      WHERE r.user_id=$1
      ORDER BY r.completed_at DESC, r.id DESC
      LIMIT 20
      `,
      [userId]
    );

    return res.json({
      user: userResult.rows[0],
      serverNow: new Date().toISOString(),
      activeLevel,
      levelConfig: cfg ? { ...cfg, cooldownLabel: getCooldownLabel(cfg.cooldownSeconds) } : null,
      today: { completed, limit, remaining, rewardUsdt: rewardToday, nextResetAt },
      accuracy,
      nextAvailableAt,
      currentQuestion,
      history: historyResult.rows.map((row) => ({
        id: row.id,
        selectedOption: row.selected_option,
        correctOption: row.correct_option,
        isCorrect: row.is_correct,
        rewardUsdt: row.reward_usdt,
        completedAt: row.completed_at,
        asset: row.asset,
        category: row.category,
        categoryLabel: categoryLabel(row.category),
        title: row.title,
      })),
    });
  } catch (error) {
    console.error("GET ROYAL AI TASKS ERROR:", error);
    return res.status(500).json({ message: "Error al cargar tareas IA.", detail: error.message });
  } finally { client.release(); }
}
async function completeVipTask(req, res) {
  const userId = getAuthUserId(req);
  const questionId = Number(req.body?.questionId || req.params?.questionId || 0);
  const selectedOption = String(req.body?.selectedOption || "").trim().toUpperCase();
  if (!questionId || !["A", "B", "C"].includes(selectedOption)) return res.status(400).json({ message: "Selecciona una opción válida." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedRoyalVipPackages(client);
    const activeLevel = await getActiveLevel(client, userId);
    const cfg = getLevelConfig(activeLevel);
    if (!cfg) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Activa un nivel para completar tareas IA." }); }

    const todayCount = await client.query(`SELECT COUNT(*)::int AS total FROM ai_task_responses WHERE user_id=$1 AND ${todayWindowSql()}`, [userId]);
    if (Number(todayCount.rows[0].total || 0) >= cfg.dailyTasks) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Ya completaste tus tareas disponibles por hoy." });
    }

    const last = await getLastResponse(client, userId);
    if (last?.next_available_at && new Date(last.next_available_at) > new Date()) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La siguiente tarea todavía está en preparación.", nextAvailableAt: last.next_available_at });
    }

    const q = await client.query(`SELECT * FROM ai_task_questions WHERE id=$1 AND is_active=true AND level_min <= $2 FOR SHARE`, [questionId, activeLevel]);
    if (!q.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "La tarea ya no está disponible." }); }
    const question = q.rows[0];
    const correctOption = question.correct_option;
    const isCorrect = selectedOption === correctOption;
    const rewardUsdt = cfg.rewardUsdt;

    const responseResult = await client.query(
      `
      INSERT INTO ai_task_responses(user_id, question_id, vip_level, selected_option, correct_option, is_correct, reward_usdt, cooldown_seconds, next_available_at, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW() + ($8::int * INTERVAL '1 second'),$9::jsonb)
      RETURNING *
      `,
      [userId, question.id, activeLevel, selectedOption, correctOption, isCorrect, rewardUsdt, cfg.cooldownSeconds, JSON.stringify({ model: "base_reward_plus_accuracy", category: question.category, asset: question.asset })]
    );
    const response = responseResult.rows[0];

    await client.query(
      `UPDATE users SET withdrawable_usdt=COALESCE(withdrawable_usdt,0)+$1, earnings_balance_usdt=COALESCE(earnings_balance_usdt,0)+$1 WHERE id=$2`,
      [rewardUsdt, userId]
    );
    await client.query(
      `
      INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
      VALUES ($1,'earnings','credit','ai_task_reward','Recompensa por tarea IA',$2,$3,'ai_task_response',$4,$5::jsonb,'completed')
      `,
      [userId, rewardUsdt, `Respuesta registrada en ${question.title}.`, response.id, JSON.stringify({ questionId: question.id, selectedOption, correctOption, isCorrect, activeLevel })]
    );
    await client.query("COMMIT");
    return res.json({
      message: "Tarea registrada correctamente.",
      rewardUsdt,
      isCorrect,
      selectedOption,
      correctOption,
      completedAt: response.completed_at,
      nextAvailableAt: response.next_available_at,
      cooldownSeconds: cfg.cooldownSeconds,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("COMPLETE ROYAL AI TASK ERROR:", error);
    return res.status(500).json({ message: "Error al registrar la tarea IA.", detail: error.message });
  } finally { client.release(); }
}

module.exports = { getTasksDashboard, completeVipTask };
