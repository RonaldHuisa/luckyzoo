const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getReinvestStatus,
  createReinvestment,
} = require("../controllers/reinvestController");

const router = express.Router();

router.get("/status", authMiddleware, getReinvestStatus);
router.post("/transfer", authMiddleware, createReinvestment);

module.exports = router;
