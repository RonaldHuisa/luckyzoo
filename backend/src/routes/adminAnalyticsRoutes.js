const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getAdminOverview,
  listAdminUsers,
  getAdminUserDetail,
  updateAdminUser,
  adjustAdminUserBalance,
  listAdminTasks,
  createAdminTask,
  updateAdminTask,
  listAdminLevels,
  updateAdminLevel,
  getAdminSecurity,
  listAdminRoulettePrizes,
  createAdminRoulettePrize,
  updateAdminRoulettePrize,
  listAdminRouletteSpins,
  adjustAdminUserRoulettePoints,
  listAdminRedeemCodes,
  createAdminRedeemCode,
  updateAdminRedeemCode,
  listAdminRedeemRedemptions,
} = require("../controllers/adminAnalyticsController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/overview", getAdminOverview);
router.get("/users", listAdminUsers);
router.get("/users/:userId", getAdminUserDetail);
router.patch("/users/:userId", updateAdminUser);
router.post("/users/:userId/balance", adjustAdminUserBalance);
router.post("/users/:userId/roulette-points", adjustAdminUserRoulettePoints);
router.get("/tasks", listAdminTasks);
router.post("/tasks", createAdminTask);
router.patch("/tasks/:questionId", updateAdminTask);
router.get("/levels", listAdminLevels);
router.patch("/levels/:level", updateAdminLevel);
router.get("/security", getAdminSecurity);
router.get("/roulette/prizes", listAdminRoulettePrizes);
router.post("/roulette/prizes", createAdminRoulettePrize);
router.patch("/roulette/prizes/:prizeId", updateAdminRoulettePrize);
router.get("/roulette/spins", listAdminRouletteSpins);
router.get("/redeem-codes", listAdminRedeemCodes);
router.post("/redeem-codes", createAdminRedeemCode);
router.patch("/redeem-codes/:codeId", updateAdminRedeemCode);
router.get("/redeem-codes/:codeId/redemptions", listAdminRedeemRedemptions);

module.exports = router;
