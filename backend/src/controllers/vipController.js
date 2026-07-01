const pool = require("../config/db");
const { createReferralCommissions } = require("../services/referralCommissionService");
const { seedRoyalVipPackages, getLevelConfig, getCooldownLabel } = require("../services/royalAiTaskService");

const CANCELLATION_FEE_PERCENT = 10;

function getAuthUserId(req) { return req.user.userId || req.user.id; }
function toNumber(v) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
function money(v) { return Number(v || 0).toFixed(2); }

async function expireOldPurchases(client, userId) {
  await client.query(
    `UPDATE vip_purchases SET status='expired' WHERE user_id=$1 AND status='active' AND expires_at <= NOW()`,
    [userId]
  );
}

async function getVipStatus(req, res) {
  const userId = getAuthUserId(req);
  const client = await pool.connect();
  try {
    await seedRoyalVipPackages(client);
    await expireOldPurchases(client, userId);

    const userResult = await client.query(
      `SELECT id,email,created_at,COALESCE(balance_usdt,0) AS balance_usdt,COALESCE(withdrawable_usdt,0) AS withdrawable_usdt,COALESCE(vip_level,0) AS vip_level,vip_expires_at FROM users WHERE id=$1`,
      [userId]
    );
    if (!userResult.rows.length) return res.status(404).json({ message: "Usuario no encontrado." });

    const activePurchases = await client.query(
      `SELECT id, package_id, level, price_usdt, expires_at, status, purchased_at
       FROM vip_purchases
       WHERE user_id=$1 AND status='active' AND expires_at > NOW() AND level >= 1
       ORDER BY level DESC, expires_at DESC`,
      [userId]
    );
    const activePurchase = activePurchases.rows[0] || null;
    const activeLevel = activePurchase ? Number(activePurchase.level) : 0;

    const highestResult = await client.query(
      `SELECT COALESCE(MAX(level),0)::int AS highest_level
       FROM vip_purchases
       WHERE user_id=$1 AND level >= 1 AND status IN ('active','expired','completed','cancelled','replaced')`,
      [userId]
    );
    const highestPurchasedLevel = Number(highestResult.rows[0]?.highest_level || 0);

    const packagesResult = await client.query(
      `SELECT id,level,name,price_usdt,daily_income_usdt,valid_days,is_purchasable,task_reward_usdt,task_cooldown_seconds,task_cooldown_minutes,daily_tasks FROM vip_packages WHERE level >= 0 ORDER BY level ASC`
    );
    const packages = packagesResult.rows.map((pkg) => {
      const level = Number(pkg.level);
      const cfg = getLevelConfig(level) || {};
      const cooldownSeconds = Number(pkg.task_cooldown_seconds || cfg.cooldownSeconds || 60);
      const isLockedByProgress = level > 0 && highestPurchasedLevel > 0 && level < highestPurchasedLevel;
      const hasActivePaidPlan = Boolean(activePurchase);
      return {
        id: pkg.id,
        level,
        name: pkg.name,
        priceUsdt: pkg.price_usdt,
        dailyIncomeUsdt: pkg.daily_income_usdt,
        taskRewardUsdt: pkg.task_reward_usdt || cfg.rewardUsdt || 0,
        taskCooldownSeconds: cooldownSeconds,
        taskCooldownMinutes: Math.ceil(cooldownSeconds / 60),
        cooldownLabel: getCooldownLabel(cooldownSeconds),
        dailyTasks: Number(pkg.daily_tasks || cfg.dailyTasks || 0),
        validDays: Number(pkg.valid_days || 30),
        isPurchasable: Boolean(pkg.is_purchasable),
        isActive: level > 0 ? level === activeLevel : !hasActivePaidPlan,
        isIncluded: level === 0,
        expiresAt: level === activeLevel ? activePurchase?.expires_at : null,
        purchasedAt: level === activeLevel ? activePurchase?.purchased_at : null,
        isLockedByProgress,
        hasActivePaidPlan,
        canBuy: level > 0 && Boolean(pkg.is_purchasable) && !isLockedByProgress && !hasActivePaidPlan,
      };
    });

    const todayIncome = await client.query(
      `SELECT COALESCE(SUM(reward_usdt),0) AS today_income_usdt FROM ai_task_responses WHERE user_id=$1 AND completed_at >= date_trunc('day', NOW()) AND completed_at < date_trunc('day', NOW()) + INTERVAL '1 day'`,
      [userId]
    );

    return res.json({
      user: userResult.rows[0],
      rechargeBalanceUsdt: userResult.rows[0].balance_usdt,
      earningsBalanceUsdt: userResult.rows[0].withdrawable_usdt,
      todayIncomeUsdt: todayIncome.rows[0]?.today_income_usdt || "0",
      vipLevel: activeLevel,
      vipExpiresAt: activePurchase ? activePurchase.expires_at : null,
      activePurchase: activePurchase ? {
        id: activePurchase.id,
        level: Number(activePurchase.level),
        priceUsdt: activePurchase.price_usdt,
        purchasedAt: activePurchase.purchased_at,
        expiresAt: activePurchase.expires_at,
        cancelRefundUsdt: money(toNumber(activePurchase.price_usdt) * (100 - CANCELLATION_FEE_PERCENT) / 100),
        cancelFeePercent: CANCELLATION_FEE_PERCENT,
      } : null,
      highestPurchasedLevel,
      rules: {
        concept: "AI Market Training",
        minimumWithdrawUsdt: 3,
        withdrawFeePercent: 10,
        referralDirectPercent: 8,
        referralIndirectPercent: 1,
        cancellationFeePercent: CANCELLATION_FEE_PERCENT,
      },
      packages,
    });
  } catch (error) {
    console.error("GET ROYAL LEVEL STATUS ERROR:", error);
    return res.status(500).json({ message: "Error al obtener niveles Royal Imperial.", detail: error.message });
  } finally { client.release(); }
}

async function buyVipPackage(req, res) {
  const userId = getAuthUserId(req);
  const numericLevel = Number(req.body?.level);
  if (!Number.isInteger(numericLevel) || numericLevel < 1 || numericLevel > 8) return res.status(400).json({ message: "Selecciona un plan válido." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedRoyalVipPackages(client);
    await expireOldPurchases(client, userId);

    const pkgResult = await client.query(`SELECT * FROM vip_packages WHERE level=$1 AND is_purchasable=true`, [numericLevel]);
    if (!pkgResult.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Plan no disponible." }); }
    const pkg = pkgResult.rows[0];

    const userResult = await client.query(`SELECT id,balance_usdt FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!userResult.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Usuario no encontrado." }); }

    const activeResult = await client.query(
      `SELECT vp.id, vp.level, p.name, vp.price_usdt, vp.expires_at
       FROM vip_purchases vp
       LEFT JOIN vip_packages p ON p.id = vp.package_id
       WHERE vp.user_id=$1 AND vp.status='active' AND vp.expires_at > NOW() AND vp.level >= 1
       ORDER BY vp.level DESC, vp.expires_at DESC
       LIMIT 1`,
      [userId]
    );
    if (activeResult.rows.length) {
      const active = activeResult.rows[0];
      await client.query("ROLLBACK");
      return res.status(409).json({ message: Number(active.level) === numericLevel ? "Este plan ya está activo." : "Cancela tu plan activo para continuar." });
    }

    const highestResult = await client.query(
      `SELECT COALESCE(MAX(level),0)::int AS highest_level
       FROM vip_purchases
       WHERE user_id=$1 AND level >= 1 AND status IN ('active','expired','completed','cancelled','replaced')`,
      [userId]
    );
    const highestPurchasedLevel = Number(highestResult.rows[0]?.highest_level || 0);
    if (highestPurchasedLevel > 0 && numericLevel < highestPurchasedLevel) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Este plan no está disponible para tu cuenta." });
    }

    const balance = toNumber(userResult.rows[0].balance_usdt);
    const price = toNumber(pkg.price_usdt);
    if (balance < price) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Saldo insuficiente. Recarga USDT para activar este plan." }); }

    const purchaseResult = await client.query(
      `INSERT INTO vip_purchases(user_id, package_id, level, price_usdt, daily_income_usdt, purchased_at, expires_at, status, metadata)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW()+($6::int * INTERVAL '1 day'),'active',$7::jsonb) RETURNING *`,
      [userId, pkg.id, pkg.level, pkg.price_usdt, pkg.daily_income_usdt, pkg.valid_days, JSON.stringify({ activationType: highestPurchasedLevel >= numericLevel ? "renewal" : "activation" })]
    );
    const purchase = purchaseResult.rows[0];

    await client.query(
      `UPDATE users SET balance_usdt=COALESCE(balance_usdt,0)-$1, recharge_balance_usdt=GREATEST(COALESCE(recharge_balance_usdt,0)-$1,0), vip_level=$2, vip_purchased_at=NOW(), vip_expires_at=$3 WHERE id=$4`,
      [pkg.price_usdt, pkg.level, purchase.expires_at, userId]
    );
    await client.query(
      `INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
       VALUES ($1,'recharge','debit','level_purchase',$2,$3,$4,'vip_purchase',$5,$6::jsonb,'completed')`,
      [userId, `Activación ${pkg.name}`, pkg.price_usdt, `Plan ${pkg.name} activado.`, purchase.id, JSON.stringify({ level: pkg.level, packageId: pkg.id, validDays: pkg.valid_days, expiresAt: purchase.expires_at })]
    );

    await createReferralCommissions(client, userId, "level_purchase", purchase.id, pkg.price_usdt, { purchasedLevel: Number(pkg.level), purchasedPackageId: Number(pkg.id) });
    await client.query("COMMIT");
    return res.status(201).json({ message: `Plan ${pkg.name} activado correctamente.`, purchase });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("BUY ROYAL LEVEL ERROR:", error);
    return res.status(500).json({ message: "Error al activar plan.", detail: error.message });
  } finally { client.release(); }
}

async function cancelActiveVipPackage(req, res) {
  const userId = getAuthUserId(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedRoyalVipPackages(client);
    await expireOldPurchases(client, userId);

    const activeResult = await client.query(
      `SELECT vp.*, p.name
       FROM vip_purchases vp
       JOIN vip_packages p ON p.id = vp.package_id
       WHERE vp.user_id=$1 AND vp.status='active' AND vp.expires_at > NOW() AND vp.level >= 1
       ORDER BY vp.level DESC, vp.expires_at DESC
       FOR UPDATE`,
      [userId]
    );

    if (!activeResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "No tienes un plan activo para cancelar." });
    }

    const purchases = activeResult.rows;
    const totalPrice = purchases.reduce((sum, p) => sum + toNumber(p.price_usdt), 0);
    const feeAmount = Number((totalPrice * CANCELLATION_FEE_PERCENT / 100).toFixed(8));
    const refundAmount = Number((totalPrice - feeAmount).toFixed(8));
    const mainPlan = purchases[0];
    const purchaseIds = purchases.map((p) => Number(p.id));

    for (const purchase of purchases) {
      const price = toNumber(purchase.price_usdt);
      const rowFee = Number((price * CANCELLATION_FEE_PERCENT / 100).toFixed(8));
      const rowRefund = Number((price - rowFee).toFixed(8));
      await client.query(
        `UPDATE vip_purchases
         SET status='cancelled', cancelled_at=NOW(), cancel_fee_percent=$1, cancel_fee_usdt=$2, refund_usdt=$3,
             metadata=COALESCE(metadata,'{}'::jsonb) || $4::jsonb
         WHERE id=$5`,
        [CANCELLATION_FEE_PERCENT, rowFee, rowRefund, JSON.stringify({ cancelledBy: "user", cancelledAt: new Date().toISOString() }), purchase.id]
      );
    }

    await client.query(
      `UPDATE users
       SET balance_usdt=COALESCE(balance_usdt,0)+$1,
           recharge_balance_usdt=COALESCE(recharge_balance_usdt,0)+$1,
           vip_level=0,
           vip_expires_at=NULL
       WHERE id=$2`,
      [refundAmount, userId]
    );

    await client.query(
      `INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
       VALUES ($1,'recharge','credit','level_cancel_refund',$2,$3,$4,'vip_purchase',$5,$6::jsonb,'completed')`,
      [
        userId,
        `Saldo acreditado`,
        refundAmount,
        `Saldo acreditado por cancelación de plan.`,
        mainPlan.id,
        JSON.stringify({ purchaseIds, cancelledLevel: Number(mainPlan.level), feePercent: CANCELLATION_FEE_PERCENT, feeAmount, refundAmount })
      ]
    );

    await client.query(
      `INSERT INTO user_security_events(user_id,event_type,reason,metadata)
       VALUES ($1,'level_cancelled',$2,$3::jsonb)`,
      [userId, `Plan cancelado por el usuario.`, JSON.stringify({ purchaseIds, level: Number(mainPlan.level), feePercent: CANCELLATION_FEE_PERCENT, feeAmount, refundAmount })]
    );

    await client.query("COMMIT");
    return res.json({ message: "Plan cancelado correctamente.", refundUsdt: refundAmount, feeUsdt: feeAmount, feePercent: CANCELLATION_FEE_PERCENT });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CANCEL ROYAL LEVEL ERROR:", error);
    return res.status(500).json({ message: "Error al cancelar plan.", detail: error.message });
  } finally { client.release(); }
}

module.exports = { getVipStatus, buyVipPackage, cancelActiveVipPackage };
