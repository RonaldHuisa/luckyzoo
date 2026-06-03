const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { scanMyDeposits } = require("../controllers/depositController");

const router = express.Router();

router.post("/scan-me", authMiddleware, scanMyDeposits);

module.exports = router;