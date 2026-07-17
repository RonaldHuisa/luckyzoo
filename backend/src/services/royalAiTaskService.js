const LEVEL_CONFIG = {
  // Modelo v1.0.79:
  // - Pasantía / plan gratis: lunes a domingo.
  // - Planes VIP/R1+: lunes a viernes.
  // - Recuperación estimada VIP: 25 días laborales.
  // - Duración VIP: 120 días calendario.
  // - Pasantía: 5 días, 6 tareas, 0.40 USDT diario.
  0: { name: "Pasantía", dailyTasks: 6, cooldownSeconds: 20, rewardUsdt: 0.0666666667, difficulty: "Inicial" },
  1: { name: "R1", dailyTasks: 6, cooldownSeconds: 30, rewardUsdt: 0.20, difficulty: "Básica" },
  2: { name: "R2", dailyTasks: 8, cooldownSeconds: 45, rewardUsdt: 0.40, difficulty: "Básica" },
  3: { name: "R3", dailyTasks: 10, cooldownSeconds: 60, rewardUsdt: 0.60, difficulty: "Intermedia" },
  4: { name: "R4", dailyTasks: 12, cooldownSeconds: 75, rewardUsdt: 1.00, difficulty: "Intermedia" },
  5: { name: "R5", dailyTasks: 14, cooldownSeconds: 90, rewardUsdt: 1.7142857143, difficulty: "Media-alta" },
  6: { name: "R6", dailyTasks: 16, cooldownSeconds: 105, rewardUsdt: 3.00, difficulty: "Avanzada" },
  7: { name: "R7", dailyTasks: 18, cooldownSeconds: 120, rewardUsdt: 5.5555555556, difficulty: "Avanzada" },
  8: { name: "R8", dailyTasks: 20, cooldownSeconds: 150, rewardUsdt: 10.00, difficulty: "Premium" },
};

const DEFAULT_PACKAGES = [
  { level: 0, name: "Pasantía", price: 0, validDays: 5, isPurchasable: false },
  { level: 1, name: "R1", price: 30, validDays: 120, isPurchasable: true },
  { level: 2, name: "R2", price: 80, validDays: 120, isPurchasable: false },
  { level: 3, name: "R3", price: 150, validDays: 120, isPurchasable: false },
  { level: 4, name: "R4", price: 300, validDays: 120, isPurchasable: false },
  { level: 5, name: "R5", price: 600, validDays: 120, isPurchasable: false },
  { level: 6, name: "R6", price: 1200, validDays: 120, isPurchasable: false },
  { level: 7, name: "R7", price: 2500, validDays: 120, isPurchasable: false },
  { level: 8, name: "R8", price: 5000, validDays: 120, isPurchasable: false },
];

const DEFAULT_QUESTIONS = [
  [0,"trend","MARKET","uptrend","Pasantía · Tendencia","El escenario muestra una línea que avanza hacia arriba de forma constante. ¿Qué lectura debería marcar la IA?","Tendencia alcista","Tendencia bajista","Movimiento lateral","A"],
  [0,"trend","MARKET","sideways","Pasantía · Rango","El escenario se mantiene en un rango similar sin dirección clara. ¿Qué clasificación es más adecuada?","Movimiento lateral","Caída fuerte","Ruptura alcista","A"],
  [0,"news","MARKET",null,"Pasantía · Noticia","Una noticia no menciona impactos directos ni cambios importantes para el mercado. ¿Qué etiqueta debería recibir?","Positiva","Neutral","Negativa","B"],
  [0,"risk","MARKET",null,"Pasantía · Riesgo","El mercado muestra cambios bruscos y señales mixtas. ¿Qué debería registrar la IA?","Mayor riesgo","Sin movimiento","Dato irrelevante","A"],
  [0,"signal","MARKET",null,"Pasantía · Señal","Una señal de IA no tiene suficiente información para confirmar tendencia. ¿Qué clasificación es más prudente?","Cautela o neutral","Compra segura","Venta garantizada","A"],
  [0,"volatility","MARKET","volatile","Pasantía · Volatilidad","El escenario muestra velas con cambios rápidos arriba y abajo. ¿Qué lectura corresponde?","Alta volatilidad","Tendencia estable","Sin datos","A"],
  [1,"trend","BTC","uptrend","Validación BTC","La IA revisa un escenario de BTC con máximos y mínimos cada vez más altos. ¿Qué etiqueta corresponde?","Tendencia alcista","Tendencia bajista","Movimiento lateral","A"],
  [1,"trend","ETH","downtrend","Validación ETH","ETH muestra caídas consecutivas y no recupera el rango anterior. ¿Cómo debería clasificarlo la IA?","Tendencia alcista","Tendencia bajista","Alta acumulación","B"],
  [1,"trend","BNB","sideways","Escenario BNB","BNB se mantiene en un rango similar sin romper arriba ni abajo. ¿Qué lectura es más clara?","Movimiento lateral","Tendencia alcista fuerte","Caída confirmada","A"],
  [1,"volatility","SOL","volatile","Volatilidad SOL","SOL sube y baja con fuerza en periodos cortos. ¿Qué nivel de volatilidad debería marcar la IA?","Baja volatilidad","Alta volatilidad","Sin movimiento","B"],
  [1,"news","MARKET",null,"Clasificación de noticia","Una empresa anuncia integración de pagos con criptomonedas. ¿Cómo debería clasificarlo la IA?","Positiva","Negativa","Neutral","A"],
  [1,"risk","BTC",null,"Nivel de riesgo","Un activo cambia de precio con movimientos bruscos y frecuentes. ¿Qué riesgo general corresponde?","Riesgo bajo","Riesgo alto","Sin riesgo","B"],
  [2,"trend","BTC","recovery","Recuperación BTC","BTC cae al inicio y luego recupera de forma sostenida. ¿Qué patrón se observa?","Recuperación","Caída sin soporte","Movimiento lateral","A"],
  [2,"trend","ETH","breakdown","Ruptura ETH","ETH pierde un nivel importante y continúa bajando. ¿Qué etiqueta corresponde?","Ruptura bajista","Consolidación alcista","Mercado neutral","A"],
  [2,"signal","SOL",null,"Revisión de señal IA","La IA etiquetó como neutral una noticia sin impacto directo en precio ni adopción. ¿La etiqueta parece correcta?","Sí, parece neutral","No, es claramente negativa","No, es claramente alcista","A"],
  [2,"news","BTC",null,"Noticia BTC","Un regulador anuncia reglas más estrictas para exchanges. ¿Qué clasificación inicial es más prudente?","Positiva","Negativa","Sin relación alguna","B"],
  [3,"comparison","ETH","uptrend","Comparación IA","Dos modelos analizan ETH: uno marca tendencia alcista moderada y otro caída fuerte. El gráfico muestra subida gradual. ¿Cuál es más lógico?","Alcista moderada","Caída fuerte","Sin datos","A"],
  [3,"risk","BNB","sideways","Riesgo BNB","BNB está lateral con bajo movimiento. ¿Qué riesgo de corto plazo parece más adecuado?","Medio o bajo","Extremadamente alto","Imposible de registrar","A"],
  [3,"volatility","BTC","volatile","Volatilidad BTC","El patrón de BTC muestra picos rápidos y retrocesos fuertes. ¿Qué validación corresponde?","Alta volatilidad","Estabilidad total","Tendencia plana perfecta","A"],
  [4,"signal","ETH",null,"Corrección de IA","La IA clasificó como negativa la frase: 'El mercado espera nuevos datos sin cambios relevantes'. ¿Qué corrección sería mejor?","Neutral","Extremadamente positiva","Bajista confirmada","A"],
  [4,"trend","MARKET","uptrend","Mercado general","El gráfico sube en escalones y corrige poco. ¿Qué lectura debería registrar la IA?","Alcista con pausas","Bajista acelerada","Lateral sin dirección","A"],
  [5,"comparison","BTC","downtrend","Modelo BTC","Un modelo marca oportunidad alcista pero el escenario muestra pérdida constante de fuerza. ¿Qué validación corresponde?","La señal debe revisarse","La señal alcista está confirmada","No existe riesgo","A"],
  [5,"news","ETH",null,"Contexto ETH","Una actualización técnica mejora eficiencia y reduce costos de red. ¿Qué clasificación general es más adecuada?","Positiva","Negativa","Irrelevante siempre","A"],
  [6,"risk","SOL","volatile","Escenario avanzado","SOL presenta alto volumen y movimientos extremos. ¿Qué debería priorizar la IA?","Advertencia de volatilidad","Baja prioridad de riesgo","Mercado totalmente estable","A"],
  [7,"signal","BTC","recovery","Validación Royal","BTC recupera soporte después de caída y sostiene rango superior. ¿Qué señal es más coherente?","Recuperación con seguimiento","Venta agresiva confirmada","Sin información útil","A"],
  [8,"comparison","MARKET","volatile","Validación Imperial","El mercado muestra alta volatilidad con señales mixtas. ¿Qué respuesta debería preferir la IA?","Mantener clasificación cautelosa","Marcar certeza absoluta","Ignorar volatilidad","A"],
];

function getLevelConfig(level) {
  return LEVEL_CONFIG[Number(level || 0)] || null;
}

async function getRuntimeLevelConfig(client, level) {
  const numericLevel = Number(level || 0);
  const fallback = getLevelConfig(numericLevel);
  const result = await client.query(
    `
    SELECT level,name,price_usdt,daily_income_usdt,valid_days,is_purchasable,task_reward_usdt,task_cooldown_seconds,task_cooldown_minutes,daily_tasks
    FROM vip_packages
    WHERE level = $1
    LIMIT 1
    `,
    [numericLevel]
  );

  const row = result.rows[0];
  if (!row && !fallback) return null;

  const cooldownSeconds = Number(row?.task_cooldown_seconds || fallback?.cooldownSeconds || 60);
  const dailyTasks = Number(row?.daily_tasks || fallback?.dailyTasks || 0);
  const rewardUsdt = Number(row?.task_reward_usdt || fallback?.rewardUsdt || 0);

  return {
    name: row?.name || fallback?.name || `R${numericLevel}`,
    level: numericLevel,
    priceUsdt: Number(row?.price_usdt || 0),
    dailyIncomeUsdt: Number(row?.daily_income_usdt || rewardUsdt * dailyTasks),
    validDays: Number(row?.valid_days || (numericLevel === 0 ? 5 : 120)),
    isPurchasable: Boolean(row?.is_purchasable),
    dailyTasks,
    cooldownSeconds,
    cooldownMinutes: Math.ceil(cooldownSeconds / 60),
    rewardUsdt,
    difficulty: fallback?.difficulty || "Royal",
  };
}

function getCooldownLabel(seconds) {
  const value = Number(seconds || 0);
  if (value < 60) return `${value} segundos`;
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${minutes}:${String(rest).padStart(2, "0")} minutos` : `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

async function ensureRoyalAiSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_task_questions (
      id SERIAL PRIMARY KEY,
      level_min INTEGER NOT NULL DEFAULT 1,
      category VARCHAR(40) NOT NULL,
      asset VARCHAR(20) NOT NULL DEFAULT 'MARKET',
      chart_type VARCHAR(30),
      title VARCHAR(160) NOT NULL,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_task_responses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES ai_task_questions(id),
      vip_level INTEGER NOT NULL DEFAULT 0,
      selected_option CHAR(1) NOT NULL CHECK (selected_option IN ('A','B','C')),
      correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C')),
      is_correct BOOLEAN NOT NULL DEFAULT FALSE,
      reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      cooldown_seconds INTEGER NOT NULL DEFAULT 60,
      next_available_at TIMESTAMP WITH TIME ZONE NOT NULL,
      completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_task_responses_user_completed ON ai_task_responses(user_id, completed_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_task_questions_level_active ON ai_task_questions(level_min, is_active)`);

  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS daily_tasks INTEGER`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS task_cooldown_seconds INTEGER`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITHOUT TIME ZONE`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS cancel_fee_percent NUMERIC(8,4) DEFAULT 10`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS cancel_fee_usdt NUMERIC(38,18) DEFAULT 0`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS refund_usdt NUMERIC(38,18) DEFAULT 0`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS cancel_reason TEXT`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_vip_purchases_user_level_history ON vip_purchases(user_id, level, status, expires_at DESC)`);

  const count = await client.query(`SELECT COUNT(*)::int AS total FROM ai_task_questions`);
  if (Number(count.rows[0].total || 0) === 0) {
    for (const q of DEFAULT_QUESTIONS) {
      await client.query(
        `INSERT INTO ai_task_questions(level_min, category, asset, chart_type, title, question, option_a, option_b, option_c, correct_option)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, q
      );
    }
  }
}

async function seedRoyalVipPackages(client) {
  await ensureRoyalAiSchema(client);
  for (const pkg of DEFAULT_PACKAGES) {
    const cfg = getLevelConfig(pkg.level);
    await client.query(
      `
      INSERT INTO vip_packages(level, name, price_usdt, daily_income_usdt, valid_days, is_purchasable, task_reward_usdt, task_cooldown_minutes, task_cooldown_seconds, daily_tasks, updated_at)
      VALUES ($1,$2,$3,$4,$5,$9,$6,CEIL($7::numeric/60),$7,$8,NOW())
      ON CONFLICT (level)
      DO UPDATE SET
        name = vip_packages.name,
        price_usdt = vip_packages.price_usdt,
        daily_income_usdt = vip_packages.daily_income_usdt,
        valid_days = vip_packages.valid_days,
        is_purchasable = vip_packages.is_purchasable,
        task_reward_usdt = vip_packages.task_reward_usdt,
        task_cooldown_minutes = vip_packages.task_cooldown_minutes,
        task_cooldown_seconds = vip_packages.task_cooldown_seconds,
        daily_tasks = vip_packages.daily_tasks,
        updated_at = vip_packages.updated_at
      `,
      [pkg.level, cfg.name, pkg.price, cfg.rewardUsdt * cfg.dailyTasks, pkg.validDays, cfg.rewardUsdt, cfg.cooldownSeconds, cfg.dailyTasks, pkg.isPurchasable !== false]
    );
  }
}

module.exports = { LEVEL_CONFIG, getLevelConfig, getRuntimeLevelConfig, getCooldownLabel, ensureRoyalAiSchema, seedRoyalVipPackages };
