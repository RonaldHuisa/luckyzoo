const pool = require('../config/db');
const { isValidEvmAddress } = require('../utils/paymentNetworks');

const SUPPORTED_WITHDRAW_NETWORKS = ['BEP20-USDT', 'POLYGON-USDT'];

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 20);
}

function normalizeCountryCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('+') ? raw.slice(0, 8) : `+${raw}`.slice(0, 8);
}

function isProfileComplete(user) {
  return Boolean(
    String(user?.full_name || '').trim().length >= 3 &&
    String(user?.phone_country_code || '').trim() &&
    String(user?.phone_number || '').trim().length >= 6
  );
}


function mapRedeemHistory(row) {
  return {
    id: row.id,
    code: row.code || '',
    balanceType: row.balance_type || '',
    amountUsdt: Number(row.amount_usdt || 0),
    createdAt: row.created_at,
  };
}

function mapBalanceTypeLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'recharge') return 'Saldo de garantía';
  if (key === 'withdrawable') return 'Saldo retirable';
  if (key === 'credit') return 'Saldo de crédito';
  return 'Saldo';
}

function mapWithdrawalAccount(row) {
  return {
    id: row.id,
    network: row.network,
    label: row.label || row.network,
    withdrawalAddress: row.withdrawal_address,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getUserProfileBundle(userId, client = pool) {
  const [userResult, accountsResult, redeemHistoryResult] = await Promise.all([
    client.query(
      `
      SELECT
        id,
        email,
        full_name,
        phone_country_iso,
        phone_country_name,
        phone_country_code,
        phone_number,
        referral_code,
        created_at,
        COALESCE(credit_points, 50) AS credit_points,
        COALESCE(withdraw_enabled, false) AS withdraw_enabled,
        withdraw_enabled_at,
        withdraw_enabled_note
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    ),
    client.query(
      `
      SELECT id, user_id, network, label, withdrawal_address, is_default, created_at, updated_at
      FROM user_withdrawal_accounts
      WHERE user_id = $1
      ORDER BY is_default DESC, network ASC, id ASC
      `,
      [userId]
    ),
    client.query(
      `
      SELECT r.id, r.amount_usdt, r.balance_type, r.created_at, c.code
      FROM redeem_code_redemptions r
      JOIN redeem_codes c ON c.id = r.code_id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 12
      `,
      [userId]
    ),
  ]);

  const user = userResult.rows[0] || null;
  const withdrawalAccounts = accountsResult.rows.map(mapWithdrawalAccount);
  const redeemHistory = redeemHistoryResult.rows.map(mapRedeemHistory);

  return {
    profile: user ? {
      id: user.id,
      email: user.email,
      fullName: user.full_name || '',
      phoneCountryIso: user.phone_country_iso || '',
      phoneCountryName: user.phone_country_name || '',
      phoneCountryCode: user.phone_country_code || '',
      phoneNumber: user.phone_number || '',
      referralCode: user.referral_code || '',
      createdAt: user.created_at || null,
      creditPoints: Number(user.credit_points || 100),
      withdrawEnabled: Boolean(user.withdraw_enabled),
      withdrawEnabledAt: user.withdraw_enabled_at || null,
      withdrawEnabledNote: user.withdraw_enabled_note || '',
      personalDataComplete: isProfileComplete(user),
    } : null,
    withdrawalAccounts,
    redeemHistory,
    redeemHistorySummary: {
      total: redeemHistory.length,
      lastCode: redeemHistory[0]?.code || '',
    },
    hasWithdrawalAccount: withdrawalAccounts.length > 0,
    withdrawalReady: Boolean(user && isProfileComplete(user) && user.withdraw_enabled && withdrawalAccounts.length > 0),
  };
}

function validateWithdrawalAccountPayload(body = {}) {
  const network = String(body.network || '').trim().toUpperCase();
  const withdrawalAddress = String(body.withdrawalAddress || body.withdrawal_address || '').trim();
  const label = String(body.label || '').trim();
  const isDefault = Boolean(body.isDefault);

  if (!SUPPORTED_WITHDRAW_NETWORKS.includes(network)) {
    return { ok: false, message: 'Selecciona una red de retiro válida.' };
  }
  if (!withdrawalAddress || !isValidEvmAddress(withdrawalAddress)) {
    return { ok: false, message: 'Ingresa una dirección de retiro válida.' };
  }
  return { ok: true, account: { network, withdrawalAddress, label: label || network, isDefault } };
}

module.exports = {
  SUPPORTED_WITHDRAW_NETWORKS,
  normalizePhone,
  normalizeCountryCode,
  isProfileComplete,
  getUserProfileBundle,
  validateWithdrawalAccountPayload,
  mapWithdrawalAccount,
  mapRedeemHistory,
  mapBalanceTypeLabel,
};
