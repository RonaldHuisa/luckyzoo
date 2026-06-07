const pool = require("../config/db");
const { sendUsdtWithdrawal } = require("../services/withdrawPaymentService");

async function getPendingWithdrawals(req, res) {
    try {
        const result = await pool.query(
            `
      SELECT
        w.id,
        w.user_id,
        u.email,
        w.network,
        w.withdrawal_address,
        w.amount_requested,
        w.fee_percent,
        w.fee_amount,
        w.amount_to_receive,
        w.status,
        w.tx_hash,
        w.admin_note,
        w.created_at,
        (
          SELECT COUNT(*)
          FROM withdrawals w2
          WHERE w2.user_id = w.user_id
          AND w2.status = 'paid'
        ) AS paid_withdrawals_count,
        (
          SELECT COUNT(*)
          FROM withdrawals w3
          WHERE w3.user_id = w.user_id
        ) AS total_withdrawals_count
      FROM withdrawals w
      INNER JOIN users u ON u.id = w.user_id
      WHERE w.status = 'pending'
      ORDER BY w.created_at ASC
      `
        );

        return res.json({
            withdrawals: result.rows,
        });
    } catch (error) {
        console.error("GET PENDING WITHDRAWALS ERROR:", error);

        return res.status(500).json({
            message: "Error al obtener retiros pendientes.",
        });
    }
}

async function getAllWithdrawals(req, res) {
    try {
        const result = await pool.query(
            `
      SELECT
        w.id,
        w.user_id,
        u.email,
        w.network,
        w.withdrawal_address,
        w.amount_requested,
        w.fee_percent,
        w.fee_amount,
        w.amount_to_receive,
        w.status,
        w.tx_hash,
        w.admin_note,
        w.created_at,
        w.paid_at,
        w.approved_at,
        w.admin_note,
        (
          SELECT COUNT(*)
          FROM withdrawals w2
          WHERE w2.user_id = w.user_id
          AND w2.status = 'paid'
        ) AS paid_withdrawals_count,
        (
          SELECT COUNT(*)
          FROM withdrawals w3
          WHERE w3.user_id = w.user_id
        ) AS total_withdrawals_count
      FROM withdrawals w
      INNER JOIN users u ON u.id = w.user_id
      ORDER BY w.created_at DESC
      LIMIT 200
      `
        );

        return res.json({
            withdrawals: result.rows,
        });
    } catch (error) {
        console.error("GET ALL WITHDRAWALS ERROR:", error);

        return res.status(500).json({
            message: "Error al obtener historial de retiros.",
        });
    }
}

async function approveWithdrawal(req, res) {
    const adminUserId = req.user.userId;
    const { withdrawalId } = req.params;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const withdrawalResult = await client.query(
            `
      SELECT
        id,
        user_id,
        network,
        withdrawal_address,
        amount_to_receive,
        status
      FROM withdrawals
      WHERE id = $1
      FOR UPDATE
      `,
            [withdrawalId]
        );

        if (withdrawalResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Solicitud de retiro no encontrada.",
            });
        }

        const withdrawal = withdrawalResult.rows[0];

        if (withdrawal.status !== "pending") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Este retiro ya fue procesado.",
            });
        }

        await client.query("COMMIT");

        const payment = await sendUsdtWithdrawal(
            withdrawal.withdrawal_address,
            withdrawal.amount_to_receive,
            withdrawal.network || "BEP20-USDT"
        );

        await client.query("BEGIN");

        const updateResult = await client.query(
            `
      UPDATE withdrawals
      SET
        status = 'paid',
        tx_hash = $1,
        approved_by = $2,
        approved_at = CURRENT_TIMESTAMP,
        paid_at = CURRENT_TIMESTAMP
      WHERE id = $3
      AND status = 'pending'
      RETURNING *
      `,
            [payment.txHash, adminUserId, withdrawalId]
        );

        if (updateResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "El retiro fue pagado en blockchain, pero ya no estaba pendiente. Revisar manualmente.",
                txHash: payment.txHash,
            });
        }

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
    status
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
  ON CONFLICT DO NOTHING
  `,
            [
                withdrawal.user_id,
                "withdrawable",
                "debit",
                "withdrawal_paid",
                "Retiro pagado",
                -Number(withdrawal.amount_to_receive),
                `Retiro pagado correctamente por ${withdrawal.amount_to_receive} USDT.`,
                "withdrawal",
                withdrawal.id,
                JSON.stringify({
                    withdrawal_id: withdrawal.id,
                    tx_hash: payment.txHash,
                    amount_to_receive: withdrawal.amount_to_receive,
                    withdrawal_address: withdrawal.withdrawal_address,
                    network: withdrawal.network || payment.network || "BEP20-USDT",
                }),
                "completed",
            ]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Retiro aprobado y pagado correctamente.",
            withdrawal: updateResult.rows[0],
            txHash: payment.txHash,
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch { }

        console.error("APPROVE WITHDRAWAL ERROR:", error);

        return res.status(500).json({
            message: "Error al aprobar retiro.",
            detail: error.message,
        });
    } finally {
        client.release();
    }
}

module.exports = {
    getPendingWithdrawals,
    getAllWithdrawals,
    approveWithdrawal,
};