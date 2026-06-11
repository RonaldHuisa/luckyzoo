const pool = require("../config/db");
const {
  ensureFreePlantPointsSchema,
  getPointsSummary,
  getPackagesForPoints,
  getPackagePointsCost,
} = require("../services/freePlantPointsService");

function getAuthUserId(req) {
  return req.user.userId || req.user.id;
}

async function getFreePlantPointsStatus(req, res) {
  try {
    const userId = getAuthUserId(req);
    await ensureFreePlantPointsSchema(pool);

    const [summary, packages] = await Promise.all([
      getPointsSummary(pool, userId),
      getPackagesForPoints(pool, userId),
    ]);

    return res.json({
      summary,
      packages,
      rules: [
        "Cada invitado directo registrado con tu enlace suma 1 punto.",
        "No se contabilizan multicuentas.",
        "Si tu invitado directo invierte en cualquier planta, recibes 2 puntos adicionales.",
        "Puedes solicitar una planta gratis cuando tengas los puntos requeridos.",
        "Cada canje aprobado entrega 15 días de vigencia VIP.",
        "Cada planta puede solicitarse una sola vez.",
        "La revisión administrativa puede demorar hasta 24 horas.",
      ],
    });
  } catch (error) {
    console.error("GET FREE PLANT POINTS STATUS ERROR:", error);
    return res.status(500).json({
      message: "Error al cargar puntos.",
      detail: error.message,
    });
  }
}

async function createFreePlantRedemption(req, res) {
  const userId = getAuthUserId(req);
  const packageId = Number(req.body?.packageId || 0);

  if (!Number.isInteger(packageId) || packageId <= 0) {
    return res.status(400).json({ message: "Selecciona una planta válida." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureFreePlantPointsSchema(client);

    const packageResult = await client.query(
      `
      SELECT id, level, name, price_usdt, daily_income_usdt, valid_days, is_purchasable,
             COALESCE(task_reward_usdt, daily_income_usdt / 4) AS task_reward_usdt
      FROM vip_packages
      WHERE id = $1
        AND level >= 1
        AND is_purchasable = true
      FOR SHARE
      `,
      [packageId]
    );

    if (packageResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Planta no disponible para canje." });
    }

    const pkg = packageResult.rows[0];
    const pointsCost = getPackagePointsCost(pkg);

    const existingResult = await client.query(
      `
      SELECT id, status
      FROM free_plant_redemptions
      WHERE user_id = $1
        AND package_id = $2
        AND status IN ('pending','approved')
      LIMIT 1
      `,
      [userId, packageId]
    );

    if (existingResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ya solicitaste esta planta." });
    }

    const summary = await getPointsSummary(client, userId);

    if (summary.availablePoints < pointsCost) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Necesitas ${pointsCost} puntos para solicitar esta planta.`,
        summary,
      });
    }

    const redemptionResult = await client.query(
      `
      INSERT INTO free_plant_redemptions
        (user_id, package_id, level, points_cost, status, metadata)
      VALUES
        ($1, $2, $3, $4, 'pending', $5::jsonb)
      RETURNING *
      `,
      [
        userId,
        pkg.id,
        pkg.level,
        pointsCost,
        JSON.stringify({
          packageName: pkg.name,
          priceUsdt: pkg.price_usdt,
          requestedFrom: "points_page",
        }),
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Solicitud enviada. Revisión administrativa hasta 24 horas.",
      redemption: redemptionResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CREATE FREE PLANT REDEMPTION ERROR:", error);
    return res.status(500).json({
      message: "Error al solicitar planta gratis.",
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

module.exports = {
  getFreePlantPointsStatus,
  createFreePlantRedemption,
};
