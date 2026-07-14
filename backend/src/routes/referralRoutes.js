const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getPromotionDashboard,
  getMembersByLevel,
  getReferralRewardsStatus,
  claimReferralReward,
} = require("../controllers/referralController");

const router = express.Router();

router.get("/dashboard", authMiddleware, getPromotionDashboard);
router.get("/rewards/status", authMiddleware, getReferralRewardsStatus);
router.post("/rewards/claim", authMiddleware, claimReferralReward);
router.get("/members/:level", authMiddleware, getMembersByLevel);

module.exports = router;