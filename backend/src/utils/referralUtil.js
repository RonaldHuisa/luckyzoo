const crypto = require("crypto");
const pool = require("../config/db");

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function generateUniqueReferralCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateReferralCode();

    const result = await pool.query(
      "SELECT id FROM users WHERE referral_code = $1",
      [code]
    );

    if (result.rows.length === 0) {
      return code;
    }
  }

  throw new Error("No se pudo generar un código de referido único.");
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "********";

  const [name, domain] = email.split("@");

  if (name.length <= 2) {
    return `${name[0]}***@${domain}`;
  }

  return `${name.slice(0, 2)}${"*".repeat(8)}@${domain}`;
}

module.exports = {
  generateUniqueReferralCode,
  maskEmail,
};