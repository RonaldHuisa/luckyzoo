const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
    getVipStatus,
    buyVipPackage,
} = require("../controllers/vipController");

const router = express.Router();

router.get("/status", authMiddleware, getVipStatus);
router.post("/buy", authMiddleware, buyVipPackage);

module.exports = router;