const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getDashboard,
  listUsers,
  listInvestments,
  listWithdrawals,
  listRecharges,
  updateReferralLimit,
  changeUserPassword,
  updateWithdrawalWallet,
} = require("../controllers/adminPanelController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/dashboard", getDashboard);
router.get("/users", listUsers);
router.get("/investments", listInvestments);
router.get("/withdrawals", listWithdrawals);
router.get("/recharges", listRecharges);
router.patch("/users/:userId/referral-limit", updateReferralLimit);
router.patch("/users/:userId/password", changeUserPassword);
router.patch("/users/:userId/wallet", updateWithdrawalWallet);

module.exports = router;
