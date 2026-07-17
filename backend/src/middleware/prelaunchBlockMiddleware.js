const { isPrelaunchFinancialActionsBlocked } = require("../services/prelaunchService");

async function blockFinancialActionsDuringPrelaunch(req, res, next) {
  try {
    const blocked = await isPrelaunchFinancialActionsBlocked();
    if (!blocked) return next();
    return res.status(423).json({
      message: "Recargas, retiros y compra de planes estarán disponibles en el lanzamiento oficial. La pasantía y tareas IA siguen activas.",
      code: "PRELAUNCH_ACTIVE",
    });
  } catch (error) {
    console.error("PRELAUNCH BLOCK CHECK ERROR:", error);
    return next();
  }
}

module.exports = { blockFinancialActionsDuringPrelaunch };
