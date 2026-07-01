const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const {
  getPendingWithdrawals,
  getAllWithdrawals,
  approveWithdrawal,
  listWithdrawalAmountOptions,
  replaceWithdrawalAmountOptions,
} = require("../controllers/adminWithdrawController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/withdrawal-amount-options", listWithdrawalAmountOptions);
router.put("/withdrawal-amount-options", replaceWithdrawalAmountOptions);
router.get("/withdrawals/pending", getPendingWithdrawals);
router.get("/withdrawals", getAllWithdrawals);
router.post("/withdrawals/:withdrawalId/approve", approveWithdrawal);

module.exports = router;