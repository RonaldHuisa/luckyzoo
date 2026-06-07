const pool = require("../config/db");

function toNumber(value) {
  return Number(value || 0);
}

async function getAdminStatus(req, res) {
  try {
    const [
      depositsResult,
      withdrawalsResult,
      usersResult,
      vipResult,
      balancesResult,
      sweepResult,
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_deposits_count,
          COALESCE(SUM(amount_usdt), 0) AS total_deposited_usdt,
          COALESCE(SUM(amount_usdt) FILTER (WHERE created_at::date = CURRENT_DATE), 0) AS deposits_today_usdt,
          COALESCE(SUM(amount_usdt) FILTER (WHERE sweep_status = 'pending'), 0) AS pending_sweep_usdt,
          COALESCE(SUM(amount_usdt) FILTER (WHERE sweep_status = 'failed'), 0) AS failed_sweep_usdt,
          COUNT(*) FILTER (WHERE sweep_status = 'pending')::int AS pending_sweep_count,
          COUNT(*) FILTER (WHERE sweep_status = 'failed')::int AS failed_sweep_count,
          COUNT(*) FILTER (WHERE sweep_status = 'swept')::int AS swept_count
        FROM deposits
        WHERE status = 'confirmed'
      `),

      pool.query(`
        SELECT
          COUNT(*)::int AS total_withdrawals_count,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_withdrawals_count,
          COUNT(*) FILTER (WHERE status = 'processing_auto')::int AS processing_auto_withdrawals_count,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_withdrawals_count,
          COUNT(*) FILTER (WHERE status = 'paid' AND admin_note ILIKE '%automático%')::int AS auto_paid_withdrawals_count,
          COALESCE(SUM(amount_to_receive) FILTER (WHERE status IN ('pending','processing_auto')), 0) AS pending_to_pay_usdt,
          COALESCE(SUM(amount_to_receive) FILTER (WHERE status = 'paid'), 0) AS paid_withdrawals_usdt,
          COALESCE(SUM(amount_to_receive) FILTER (WHERE status = 'paid' AND paid_at::date = CURRENT_DATE), 0) AS paid_withdrawals_today_usdt,
          COALESCE(SUM(amount_requested) FILTER (WHERE status IN ('pending','processing_auto')), 0) AS pending_requested_usdt,
          COALESCE(SUM(amount_requested) FILTER (WHERE status = 'paid' AND paid_at::date = CURRENT_DATE), 0) AS requested_withdrawals_today_usdt,
          COALESCE(SUM(fee_amount) FILTER (WHERE status IN ('pending','processing_auto')), 0) AS pending_fees_usdt,
          COALESCE(SUM(fee_amount) FILTER (WHERE status = 'paid'), 0) AS paid_fees_usdt,
          COALESCE(SUM(fee_amount) FILTER (WHERE status = 'paid' AND paid_at::date = CURRENT_DATE), 0) AS paid_fees_today_usdt
        FROM withdrawals
      `),

      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE is_admin = true)::int AS admin_users,
          COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS new_users_today
        FROM users
      `),

      pool.query(`
        SELECT
          COUNT(*)::int AS total_vip_purchases,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_vip_purchases,
          COALESCE(SUM(price_usdt), 0) AS total_vip_sold_usdt,
          COALESCE(SUM(price_usdt) FILTER (WHERE status = 'active'), 0) AS active_vip_usdt
        FROM vip_purchases
      `),

      pool.query(`
        SELECT
          COALESCE(SUM(balance_usdt), 0) AS users_recharge_balance_usdt,
          COALESCE(SUM(withdrawable_usdt), 0) AS users_withdrawable_balance_usdt
        FROM users
      `),

      pool.query(`
        SELECT
          COALESCE(SUM(amount_usdt) FILTER (WHERE sweep_status IN ('pending', 'failed')), 0) AS sweep_remaining_usdt,
          COUNT(*) FILTER (WHERE sweep_status IN ('pending', 'failed'))::int AS sweep_remaining_count
        FROM deposits
        WHERE status = 'confirmed'
      `),
    ]);

    const deposits = depositsResult.rows[0] || {};
    const withdrawals = withdrawalsResult.rows[0] || {};
    const users = usersResult.rows[0] || {};
    const vip = vipResult.rows[0] || {};
    const balances = balancesResult.rows[0] || {};
    const sweep = sweepResult.rows[0] || {};

    const totalDeposited = toNumber(deposits.total_deposited_usdt);
    const paidWithdrawals = toNumber(withdrawals.paid_withdrawals_usdt);
    const pendingToPay = toNumber(withdrawals.pending_to_pay_usdt);
    const rechargeBalance = toNumber(balances.users_recharge_balance_usdt);
    const withdrawableBalance = toNumber(balances.users_withdrawable_balance_usdt);
    const totalVipSold = toNumber(vip.total_vip_sold_usdt);

    return res.json({
      totals: {
        totalDepositedUsdt: totalDeposited,
        depositsTodayUsdt: toNumber(deposits.deposits_today_usdt),
        totalDepositCount: Number(deposits.total_deposits_count || 0),

        paidWithdrawalsUsdt: paidWithdrawals,
        paidWithdrawalsTodayUsdt: toNumber(withdrawals.paid_withdrawals_today_usdt),
        requestedWithdrawalsTodayUsdt: toNumber(withdrawals.requested_withdrawals_today_usdt),
        pendingWithdrawalsUsdt: pendingToPay,
        pendingRequestedUsdt: toNumber(withdrawals.pending_requested_usdt),
        paidFeesUsdt: toNumber(withdrawals.paid_fees_usdt),
        pendingFeesUsdt: toNumber(withdrawals.pending_fees_usdt),
        paidFeesTodayUsdt: toNumber(withdrawals.paid_fees_today_usdt),

        totalVipSoldUsdt: totalVipSold,
        activeVipUsdt: toNumber(vip.active_vip_usdt),

        usersRechargeBalanceUsdt: rechargeBalance,
        usersWithdrawableBalanceUsdt: withdrawableBalance,

        netAfterPaidWithdrawalsUsdt: totalDeposited - paidWithdrawals,
        estimatedObligationUsdt: pendingToPay + withdrawableBalance,
        remainingAfterPendingUsdt: totalDeposited - paidWithdrawals - pendingToPay,
      },

      counts: {
        totalUsers: Number(users.total_users || 0),
        newUsersToday: Number(users.new_users_today || 0),
        adminUsers: Number(users.admin_users || 0),

        totalWithdrawals: Number(withdrawals.total_withdrawals_count || 0),
        pendingWithdrawals: Number(withdrawals.pending_withdrawals_count || 0),
        processingAutoWithdrawals: Number(withdrawals.processing_auto_withdrawals_count || 0),
        autoPaidWithdrawals: Number(withdrawals.auto_paid_withdrawals_count || 0),
        paidWithdrawals: Number(withdrawals.paid_withdrawals_count || 0),

        totalVipPurchases: Number(vip.total_vip_purchases || 0),
        activeVipPurchases: Number(vip.active_vip_purchases || 0),

        pendingSweepCount: Number(deposits.pending_sweep_count || 0),
        failedSweepCount: Number(deposits.failed_sweep_count || 0),
        sweptCount: Number(deposits.swept_count || 0),
        sweepRemainingCount: Number(sweep.sweep_remaining_count || 0),
      },

      sweep: {
        pendingSweepUsdt: toNumber(deposits.pending_sweep_usdt),
        failedSweepUsdt: toNumber(deposits.failed_sweep_usdt),
        sweepRemainingUsdt: toNumber(sweep.sweep_remaining_usdt),
      },
    });
  } catch (error) {
    console.error("GET ADMIN STATUS ERROR:", error);

    return res.status(500).json({
      message: "Error al obtener estado administrativo.",
      detail: error.message,
    });
  }
}

module.exports = {
  getAdminStatus,
};
