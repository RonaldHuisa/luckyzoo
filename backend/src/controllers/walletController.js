const pool = require("../config/db");
const { getPaymentNetwork, listPaymentNetworks } = require("../utils/paymentNetworks");

async function getMyWallet(req, res) {
  try {
    const userId = req.user.userId;
    const network = getPaymentNetwork(req.query.network || "BEP20-USDT", {
      deposit: true,
    });

    const walletResult = await pool.query(
      `
      SELECT id, user_id, network, address, public_key, created_at
      FROM wallets
      WHERE user_id = $1
        AND network = $2
      ORDER BY id ASC
      LIMIT 1
      `,
      [userId, network.code]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({
        message: "No se encontró wallet para este usuario.",
      });
    }

    const wallet = walletResult.rows[0];

    return res.json({
      wallet: {
        ...wallet,
        network: network.code,
        asset: network.asset,
        chain: network.chain,
        displayName: network.displayName,
        nativeSymbol: network.nativeSymbol,
      },
      supportedNetworks: listPaymentNetworks().filter((item) => item.depositEnabled),
    });
  } catch (error) {
    console.error("GET MY WALLET ERROR:", error);
    return res.status(500).json({
      message: "Error interno al obtener la wallet.",
      detail: error.message,
    });
  }
}

module.exports = {
  getMyWallet,
};
