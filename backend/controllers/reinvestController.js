const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { refreshMiningAccountForUser } = require("../services/miningService");

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function round6(value) {
  return Math.round(toNumber(value) * 1_000_000) / 1_000_000;
}

async function getReinvestStatus(req, res) {
  const userId = req.user.userId || req.user.id;

  try {
    const refreshed = await refreshMiningAccountForUser(pool, { userId, email: req.user.email });

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        COALESCE(u.withdrawable_usdt, 0) AS withdrawable_usdt,
        COALESCE(u.earnings_balance_usdt, 0) AS earnings_balance_usdt,
        COALESCE(u.balance_usdt, 0) AS balance_usdt,
        COALESCE(u.recharge_balance_usdt, 0) AS recharge_balance_usdt,
        COALESCE(ma.invested_amount, u.balance_usdt, u.recharge_balance_usdt, 0) AS invested_amount,
        COALESCE(ma.daily_percent, 0) AS daily_percent,
        COALESCE(ma.daily_reward, 0) AS daily_reward,
        mp.name AS mining_level
      FROM users u
      LEFT JOIN mining_accounts ma ON ma.user_id = u.id
      LEFT JOIN mining_plans mp ON mp.id = ma.current_plan_id
      WHERE u.id = $1
      LIMIT 1
      `,
      [refreshed?.user?.id || userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const row = result.rows[0];

    return res.json({
      user: {
        id: row.id,
        email: row.email,
      },
      balances: {
        commissionWalletUsdt: row.withdrawable_usdt,
        earningsBalanceUsdt: row.earnings_balance_usdt,
        investmentWalletUsdt: row.invested_amount,
        balanceUsdt: row.balance_usdt,
        rechargeBalanceUsdt: row.recharge_balance_usdt,
      },
      mining: {
        level: row.mining_level || null,
        dailyPercent: row.daily_percent,
        dailyReward: row.daily_reward,
      },
    });
  } catch (error) {
    console.error("GET REINVEST STATUS ERROR:", error);
    return res.status(500).json({
      message: "Error al obtener datos de reinversión.",
      detail: error.message,
    });
  }
}

async function createReinvestment(req, res) {
  const userId = req.user.userId || req.user.id;
  const { amount, securityPassword } = req.body;
  const amountNumber = round6(amount);

  if (!amountNumber || amountNumber <= 0) {
    return res.status(400).json({ message: "Ingresa un monto válido para reinvertir." });
  }

  if (!securityPassword) {
    return res.status(400).json({ message: "El PIN de seguridad es obligatorio." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `
      SELECT
        id,
        email,
        password_hash,
        security_password_hash,
        COALESCE(withdrawable_usdt, 0) AS withdrawable_usdt,
        COALESCE(earnings_balance_usdt, 0) AS earnings_balance_usdt,
        COALESCE(balance_usdt, 0) AS balance_usdt,
        COALESCE(recharge_balance_usdt, 0) AS recharge_balance_usdt
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [userId]
    );

    if (!userResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = userResult.rows[0];
    const available = toNumber(user.withdrawable_usdt);

    if (amountNumber > available) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El monto no puede ser mayor a tu monedero de comisiones." });
    }

    const pinHash = user.security_password_hash || user.password_hash;
    const pinOk = await bcrypt.compare(securityPassword, pinHash);

    if (!pinOk) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "PIN de seguridad incorrecto." });
    }

    const updatedUserResult = await client.query(
      `
      UPDATE users
      SET
        withdrawable_usdt = COALESCE(withdrawable_usdt, 0) - $1,
        earnings_balance_usdt = GREATEST(COALESCE(earnings_balance_usdt, 0) - $1, 0),
        balance_usdt = COALESCE(balance_usdt, 0) + $1,
        recharge_balance_usdt = COALESCE(recharge_balance_usdt, 0) + $1
      WHERE id = $2
      RETURNING
        id,
        email,
        COALESCE(withdrawable_usdt, 0) AS withdrawable_usdt,
        COALESCE(earnings_balance_usdt, 0) AS earnings_balance_usdt,
        COALESCE(balance_usdt, 0) AS balance_usdt,
        COALESCE(recharge_balance_usdt, 0) AS recharge_balance_usdt
      `,
      [amountNumber, user.id]
    );

    const debitLedger = await client.query(
      `
      INSERT INTO account_ledger
      (
        user_id,
        balance_type,
        direction,
        type,
        title,
        amount_usdt,
        description,
        reference_type,
        metadata,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,NOW())
      RETURNING id
      `,
      [
        user.id,
        "withdrawable",
        "debit",
        "reinvestment_debit",
        "Reinversión desde monedero de comisiones",
        -amountNumber,
        `Se transfirieron ${amountNumber} USDT desde el monedero de comisiones hacia inversión.`,
        "reinvestment",
        JSON.stringify({ amount_usdt: amountNumber, from: "commission_wallet", to: "investment_wallet" }),
        "completed",
      ]
    );

    await client.query(
      `
      INSERT INTO account_ledger
      (
        user_id,
        balance_type,
        direction,
        type,
        title,
        amount_usdt,
        description,
        reference_type,
        reference_id,
        metadata,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,NOW())
      `,
      [
        user.id,
        "investment",
        "credit",
        "reinvestment_credit",
        "Reinversión agregada a cartera de inversión",
        amountNumber,
        `Se agregaron ${amountNumber} USDT a la cartera de inversión.`,
        "reinvestment",
        debitLedger.rows[0].id,
        JSON.stringify({ amount_usdt: amountNumber, from: "commission_wallet", to: "investment_wallet" }),
        "completed",
      ]
    );

    const refreshed = await refreshMiningAccountForUser(client, {
      userId: user.id,
      email: user.email,
    });

    await client.query("COMMIT");

    const updated = updatedUserResult.rows[0];

    return res.status(201).json({
      message: "Reinversión realizada correctamente.",
      amountUsdt: amountNumber,
      balances: {
        commissionWalletUsdt: updated.withdrawable_usdt,
        earningsBalanceUsdt: updated.earnings_balance_usdt,
        balanceUsdt: updated.balance_usdt,
        rechargeBalanceUsdt: updated.recharge_balance_usdt,
        investmentWalletUsdt: refreshed?.account?.invested_amount || updated.balance_usdt,
      },
      mining: {
        level: refreshed?.plan?.name || null,
        dailyPercent: refreshed?.account?.daily_percent || "0",
        dailyReward: refreshed?.account?.daily_reward || "0",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("CREATE REINVESTMENT ERROR:", error);
    return res.status(500).json({
      message: "Error al realizar la reinversión.",
      detail: error.message,
    });
  } finally {
    client.release();
  }
}

module.exports = {
  getReinvestStatus,
  createReinvestment,
};
