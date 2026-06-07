const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getPromoters,
  getUserOverview,
  addManualInvestment,
  addManualWithdrawable,
  addManualMiningPower,
} = require("../controllers/adminGrowthController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/growth/promoters", getPromoters);
router.get("/growth/user", getUserOverview);
router.post("/growth/manual-investment", addManualInvestment);
router.post("/growth/manual-withdrawable", addManualWithdrawable);
router.post("/growth/manual-mining-power", addManualMiningPower);

module.exports = router;
