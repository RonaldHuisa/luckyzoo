const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getMiningStatus, claimMiningReward } = require("../controllers/miningController");

const router = express.Router();

router.get("/status", authMiddleware, getMiningStatus);
router.post("/claim", authMiddleware, claimMiningReward);

module.exports = router;
