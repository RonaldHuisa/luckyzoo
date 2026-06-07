const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getStatus, syncStatus, redeem } = require("../controllers/hashRewardsController");

const router = express.Router();

router.get("/status", authMiddleware, getStatus);
router.post("/sync", authMiddleware, syncStatus);
router.post("/redeem", authMiddleware, redeem);

module.exports = router;
