const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { scanMyDeposits } = require("../controllers/depositController");
const { blockFinancialActionsDuringPrelaunch } = require("../middleware/prelaunchBlockMiddleware");

const router = express.Router();

router.post("/scan-me", authMiddleware, blockFinancialActionsDuringPrelaunch, scanMyDeposits);

module.exports = router;