const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { blockFinancialActionsDuringPrelaunch } = require("../middleware/prelaunchBlockMiddleware");

const {
    getVipStatus,
    buyVipPackage,
    cancelActiveVipPackage,
} = require("../controllers/vipController");

const router = express.Router();

router.get("/status", authMiddleware, getVipStatus);
router.post("/buy", authMiddleware, blockFinancialActionsDuringPrelaunch, buyVipPackage);
router.post("/cancel", authMiddleware, blockFinancialActionsDuringPrelaunch, cancelActiveVipPackage);

module.exports = router;