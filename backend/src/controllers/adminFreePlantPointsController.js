const pool = require("../config/db");
const {
  ensureFreePlantPointsSchema,
  getPointsSummary,
} = require("../services/freePlantPointsService");

function getAuthUserId(req) {
  return req.user.userId || req.user.id;
}

async function getAdminFreePlantRequests(req, res) {
  const status = String(req.query?.status || "pending").trim().toLowerCase();

  try {
    await ensureFreePlantPointsSchema(pool);

    const result = await pool.query(
      `
      SELECT
        r.id,
        r.user_id,
        u.email,
        u.referral_code,
        r.package_id,
        p.name AS package_name,
        r.level,
        r.points_cost,
        r.status,
        r.admin_note,
        r.requested_at,
        r.reviewed_at,
        r.vip_purchase_id,
        reviewer.email AS reviewed_by_email
      FROM free_plant_redemptions r
      JOIN users u ON u.id = r.user_id
      JOIN vip_packages p ON p.id = r.package_id
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE ($1::text = 'all' OR r.status = $1::text)
      ORDER BY
        CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
        r.requested_at DESC
      LIMIT 300
      `,
      [status]
    );

    return res.json({ requests: result.rows });
  } catch (error) {
    console.error("GET ADMIN FREE PLANT REQUESTS ERROR:", error);
    return res.status(500).json({
      message: "Error al cargar solicitudes.",
      detail: error.message,
    });
  }
}

async function approveFreePlantRequest(req, res) {
  const requestId = Number(req.params.id || 0);
  const note = String(req.body?.note || "").trim();
  const adminId = getAuthUserId(req);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ message: "Solicitud inválida." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureFreePlantPointsSchema(client);

    const requestResult = await client.query(
      `
      SELECT
        r.*,
        p.name AS package_name,
        p.price_usdt,
        p.daily_income_usdt,
        p.valid_days,
        COALESCE(p.task_reward_usdt, p.daily_income_usdt / 4) AS task_reward_usdt,
        COALESCE(p.task_cooldown_minutes, 360) AS task_cooldown_minutes
      FROM free_plant_redemptions r
      JOIN vip_packages p ON p.id = r.package_id
      WHERE r.id = $1
      FOR UPDATE
      `,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Solicitud no encontrada." });
    }

    const request = requestResult.rows[0];

    if (request.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta solicitud ya fue revisada." });
    }

    const summary = await getPointsSummary(client, request.user_id);
    const requestCost = Number(request.points_cost || 0);

    /*
      IMPORTANTE:
      getPointsSummary() descuenta las solicitudes pending/approved como puntos reservados.
      Esta solicitud pendiente ya está incluida en usedPoints, por eso al aprobarla no debemos
      volver a exigir que esos puntos estén "disponibles"; debemos validar los puntos disponibles
      excluyendo esta misma solicitud.
    */
    const usedByOtherRequests = Math.max(Number(summary.usedPoints || 0) - requestCost, 0);
    const availableForThisApproval = Math.max(Number(summary.totalPoints || 0) - usedByOtherRequests, 0);

    if (availableForThisApproval < requestCost) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `El usuario ya no tiene puntos suficientes. Tiene ${availableForThisApproval} disponibles y necesita ${requestCost}.`,
      });
    }

    const bonusDays = 15;

    const activeSameResult = await client.query(
      `
      SELECT id, expires_at
      FROM vip_purchases
      WHERE user_id = $1
        AND level = $2
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [request.user_id, request.level]
    );

    let purchase;
    let approvalMode = "new_15_days";

    if (activeSameResult.rows.length > 0) {
      approvalMode = "extended_15_days";

      const extendedResult = await client.query(
        `
        UPDATE vip_purchases
        SET expires_at = expires_at + ($1::int * INTERVAL '1 day')
        WHERE id = $2
        RETURNING *
        `,
        [bonusDays, activeSameResult.rows[0].id]
      );

      purchase = extendedResult.rows[0];
    } else {
      const purchaseResult = await client.query(
        `
        INSERT INTO vip_purchases
          (user_id, package_id, level, price_usdt, daily_income_usdt, purchased_at, expires_at, status)
        VALUES
          ($1,$2,$3,0,$4,NOW(),NOW() + ($5::int * INTERVAL '1 day'),'active')
        RETURNING *
        `,
        [
          request.user_id,
          request.package_id,
          request.level,
          request.daily_income_usdt,
          bonusDays,
        ]
      );

      purchase = purchaseResult.rows[0];
    }

    await client.query(
      `
      UPDATE users
      SET
        vip_level = GREATEST(COALESCE(vip_level, 0), $1),
        vip_purchased_at = COALESCE(vip_purchased_at, NOW()),
        vip_expires_at = CASE
          WHEN vip_expires_at IS NULL OR vip_expires_at < $2 THEN $2
          ELSE vip_expires_at
        END
      WHERE id = $3
      `,
      [request.level, purchase.expires_at, request.user_id]
    );

    await client.query(
      `
      INSERT INTO account_ledger
        (user_id, balance_type, direction, type, title, amount_usdt, description, reference_type, reference_id, metadata, status)
      VALUES
        ($1,'points','debit','free_plant_redemption',$2,$3,$4,'free_plant_redemption',$5,$6::jsonb,'completed')
      ON CONFLICT DO NOTHING
      `,
      [
        request.user_id,
        `Canje de puntos por ${request.package_name}`,
        request.points_cost,
        approvalMode === "extended_15_days"
          ? `Canje aprobado por ${request.points_cost} puntos. Se añadieron 15 días a la planta activa.`
          : `Canje aprobado por ${request.points_cost} puntos. Planta activada por 15 días sin descuento de saldo.`,
        request.id,
        JSON.stringify({
          packageId: request.package_id,
          treeLevel: request.level,
          vipPurchaseId: purchase.id,
          adminId,
          note,
        }),
      ]
    );

    const updateResult = await client.query(
      `
      UPDATE free_plant_redemptions
      SET
        status = 'approved',
        admin_note = $1,
        reviewed_at = NOW(),
        reviewed_by = $2,
        vip_purchase_id = $3
      WHERE id = $4
      RETURNING *
      `,
      [note || "Aprobado", adminId, purchase.id, requestId]
    );

    await client.query("COMMIT");

    return res.json({
      message: approvalMode === "extended_15_days" ? "Canje aprobado. Se añadieron 15 días a la planta activa." : "Canje aprobado. Planta activada por 15 días.",
      request: updateResult.rows[0],
      purchase,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("APPROVE FREE PLANT REQUEST ERROR:", error);
    return res.status(500).json({
      message: "Error al aprobar solicitud.",
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

async function rejectFreePlantRequest(req, res) {
  const requestId = Number(req.params.id || 0);
  const note = String(req.body?.note || "").trim();
  const adminId = getAuthUserId(req);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ message: "Solicitud inválida." });
  }

  try {
    await ensureFreePlantPointsSchema(pool);

    const result = await pool.query(
      `
      UPDATE free_plant_redemptions
      SET
        status = 'rejected',
        admin_note = $1,
        reviewed_at = NOW(),
        reviewed_by = $2
      WHERE id = $3
        AND status = 'pending'
      RETURNING *
      `,
      [note || "Rechazado", adminId, requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Solicitud pendiente no encontrada." });
    }

    return res.json({
      message: "Solicitud rechazada.",
      request: result.rows[0],
    });
  } catch (error) {
    console.error("REJECT FREE PLANT REQUEST ERROR:", error);
    return res.status(500).json({
      message: "Error al rechazar solicitud.",
      detail: error.message,
    });
  }
}

module.exports = {
  getAdminFreePlantRequests,
  approveFreePlantRequest,
  rejectFreePlantRequest,
};
