const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { blockFinancialActionsDuringPrelaunch } = require("../middleware/prelaunchBlockMiddleware");
const {
  getWithdrawInfo,
  createWithdrawRequest,
  getMyTransactions,
} = require("../controllers/withdrawController");

const router = express.Router();

router.get("/me", authMiddleware, getWithdrawInfo);
router.post("/request", authMiddleware, blockFinancialActionsDuringPrelaunch, createWithdrawRequest);
router.get("/transactions", authMiddleware, getMyTransactions);

module.exports = router;