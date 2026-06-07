const { getMarketPrices } = require("../services/marketService");

async function getPrices(req, res) {
  try {
    const force = String(req.query.force || "false").toLowerCase() === "true";
    const result = await getMarketPrices({ force });

    return res.json(result);
  } catch (error) {
    console.error("GET MARKET PRICES ERROR:", error);
    return res.status(502).json({
      message: "No se pudieron cargar precios del mercado.",
      detail: error.message,
    });
  }
}

module.exports = {
  getPrices,
};
