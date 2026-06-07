const pool = require("../config/db");
const { createReferralCommissions } = require("../services/referralCommissionService");
const { ensureGreenVestTreeSchema } = require("../services/greenVestTreeService");

function getAuthUserId(req) {
  return req.user.userId || req.user.id;
}

async function getVipStatus(req, res) {
  try {
    await ensureGreenVestTreeSchema(pool);
    const userId = getAuthUserId(req);

    const userResult = await pool.query(
      `
      SELECT
        id,
        email,
        COALESCE(balance_usdt, 0) AS balance_usdt,
        COALESCE(withdrawable_usdt, 0) AS withdrawable_usdt,
        COALESCE(vip_level, 0) AS vip_level,
        vip_expires_at,
        created_at
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = userResult.rows[0];

    const todayIncomeResult = await pool.query(
      `
      SELECT COALESCE(SUM(reward_usdt), 0) AS today_income_usdt
      FROM vip_daily_tasks
      WHERE user_id = $1
        AND status = 'completed'
        AND completed_at >= date_trunc('day', NOW())
        AND completed_at < date_trunc('day', NOW()) + INTERVAL '1 day'
      `,
      [userId]
    );

    const packagesResult = await pool.query(
      `
      SELECT
        id,
        level,
        name,
        price_usdt,
        daily_income_usdt,
        valid_days,
        is_purchasable,
        COALESCE(task_reward_usdt, daily_income_usdt / 4) AS task_reward_usdt,
        COALESCE(task_cooldown_minutes, 360) AS task_cooldown_minutes
      FROM vip_packages
      ORDER BY level ASC
      `
    );

    const activePurchasesResult = await pool.query(
      `
      SELECT DISTINCT ON (level)
        id,
        package_id,
        level,
        expires_at,
        status,
        purchased_at
      FROM vip_purchases
      WHERE user_id = $1
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY level ASC, expires_at DESC
      `,
      [userId]
    );

    const everPurchasedResult = await pool.query(
      `
      SELECT level, COUNT(*)::int AS total
      FROM vip_purchases
      WHERE user_id = $1
        AND level >= 1
      GROUP BY level
      `,
      [userId]
    );

    const activeMap = new Map();
    activePurchasesResult.rows.forEach((purchase) => activeMap.set(Number(purchase.level), purchase));

    const purchasedMap = new Map();
    everPurchasedResult.rows.forEach((item) => purchasedMap.set(Number(item.level), Number(item.total || 0)));

    const packages = packagesResult.rows.map((pkg) => {
      const active = activeMap.get(Number(pkg.level));
      const level = Number(pkg.level);
      const dailyIncome = Number(pkg.daily_income_usdt || 0);
      const waterReward = Number(pkg.task_reward_usdt || 0);
      const durationDays = Number(pkg.valid_days || 0);

      return {
        id: pkg.id,
        level,
        name: pkg.name,
        priceUsdt: pkg.price_usdt,
        dailyIncomeUsdt: pkg.daily_income_usdt,
        taskRewardUsdt: pkg.task_reward_usdt,
        waterRewardUsdt: pkg.task_reward_usdt,
        taskCooldownMinutes: Number(pkg.task_cooldown_minutes || 360),
        validDays: durationDays,
        totalRewardUsdt: (dailyIncome * durationDays).toFixed(2),
        isPurchasable: Boolean(pkg.is_purchasable),
        isFree: level === 0,
        isActive: Boolean(active),
        hasPurchased: Boolean(purchasedMap.get(level)) || level === 0,
        expiresAt: active ? active.expires_at : null,
        purchasedAt: active ? active.purchased_at : null,
        label: level === 0 ? "Brote de Pasantía" : `Nivel ${level}`,
        waterName: level === 0 ? "Agua de Brote de Pasantía" : `Agua de ${pkg.name}`,
      };
    });

    const highestActive = [...activeMap.values()]
      .filter((item) => Number(item.level) >= 1)
      .sort((a, b) => Number(b.level) - Number(a.level))[0];

    return res.json({
      user,
      rechargeBalanceUsdt: user.balance_usdt,
      earningsBalanceUsdt: user.withdrawable_usdt,
      todayIncomeUsdt: todayIncomeResult.rows[0].today_income_usdt,
      vipLevel: highestActive ? Number(highestActive.level) : Number(user.vip_level || 0),
      vipExpiresAt: highestActive ? highestActive.expires_at : user.vip_expires_at,
      rules: {
        freeLevelName: "Brote de Pasantía",
        freeLevelDurationDays: 3,
        waterCooldownHours: 6,
        minimumWithdrawUsdt: 3,
        withdrawFeePercent: 5,
        referralCommissionPercent: 5,
        referralCommissionStartsAtLevel: 1,
      },
      packages,
    });
  } catch (error) {
    console.error("GET VIP STATUS ERROR:", error);
    return res.status(500).json({
      message: "Error al obtener información de árboles GreenVest.",
      detail: error.message,
    });
  }
}

async function buyVipPackage(req, res) {
  const userId = getAuthUserId(req);
  const { level } = req.body;

  if (level === undefined || level === null || level === "") {
    return res.status(400).json({ message: "Selecciona un árbol GreenVest." });
  }

  const numericLevel = Number(level);

  if (!Number.isInteger(numericLevel) || numericLevel < 1) {
    return res.status(400).json({ message: "Árbol GreenVest inválido." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureGreenVestTreeSchema(client);

    const packageResult = await client.query(
      `
      SELECT
        id,
        level,
        name,
        price_usdt,
        daily_income_usdt,
        valid_days,
        is_purchasable,
        COALESCE(task_reward_usdt, daily_income_usdt / 4) AS task_reward_usdt,
        COALESCE(task_cooldown_minutes, 360) AS task_cooldown_minutes
      FROM vip_packages
      WHERE level = $1
      `,
      [numericLevel]
    );

    if (packageResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Árbol GreenVest no encontrado." });
    }

    const treePackage = packageResult.rows[0];

    if (!treePackage.is_purchasable) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este árbol no está disponible para compra directa." });
    }

    const userResult = await client.query(
      `
      SELECT id, balance_usdt
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = userResult.rows[0];
    const balance = Number(user.balance_usdt || 0);
    const price = Number(treePackage.price_usdt || 0);

    if (balance < price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Saldo insuficiente. Por favor recarga primero." });
    }

    const activeSameTree = await client.query(
      `
      SELECT id
      FROM vip_purchases
      WHERE user_id = $1
        AND level = $2
        AND status = 'active'
        AND expires_at > NOW()
      LIMIT 1
      `,
      [userId, treePackage.level]
    );

    if (activeSameTree.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ya tienes activo este árbol." });
    }

    const purchaseResult = await client.query(
      `
      INSERT INTO vip_purchases
      (user_id, package_id, level, price_usdt, daily_income_usdt, purchased_at, expires_at, status)
      VALUES ($1,$2,$3,$4,$5,NOW(),NOW() + ($6::int * INTERVAL '1 day'),'active')
      RETURNING *
      `,
      [
        userId,
        treePackage.id,
        treePackage.level,
        treePackage.price_usdt,
        treePackage.daily_income_usdt,
        treePackage.valid_days,
      ]
    );

    const purchase = purchaseResult.rows[0];

    await client.query(
      `
      UPDATE users
      SET
        balance_usdt = COALESCE(balance_usdt, 0) - $1,
        vip_level = GREATEST(COALESCE(vip_level, 0), $2),
        vip_purchased_at = COALESCE(vip_purchased_at, NOW()),
        vip_expires_at = CASE
          WHEN vip_expires_at IS NULL OR vip_expires_at < $3 THEN $3
          ELSE vip_expires_at
        END
      WHERE id = $4
      `,
      [treePackage.price_usdt, treePackage.level, purchase.expires_at, userId]
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
        "recharge",
        "debit",
        "tree_purchase",
        `Plantación de ${treePackage.name}`,
        treePackage.price_usdt,
        `Compra del árbol ${treePackage.name} por ${treePackage.price_usdt} USDT.`,
        "vip_purchase",
        purchase.id,
        JSON.stringify({
          treeLevel: treePackage.level,
          treeName: treePackage.name,
          packageId: treePackage.id,
          validDays: treePackage.valid_days,
          waterRewardUsdt: treePackage.task_reward_usdt,
          waterCooldownMinutes: treePackage.task_cooldown_minutes,
          expiresAt: purchase.expires_at,
        }),
        "completed",
      ]
    );

    await createReferralCommissions(client, userId, "tree_purchase", purchase.id, treePackage.price_usdt, {
      purchasedLevel: Number(treePackage.level),
      purchasedPackageId: Number(treePackage.id),
    });

    await client.query("COMMIT");

    return res.status(201).json({
      message: `${treePackage.name} plantado correctamente. Su agua estará disponible cada 6 horas.`,
      purchase,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("BUY TREE PACKAGE ERROR:", error);
    return res.status(500).json({
      message: "Error al plantar árbol GreenVest.",
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

module.exports = {
  getVipStatus,
  buyVipPackage,
};
