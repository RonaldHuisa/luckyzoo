const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getFreePlantPointsStatus,
  createFreePlantRedemption,
} = require("../controllers/freePlantPointsController");

const router = express.Router();

router.use(authMiddleware);

router.get("/status", getFreePlantPointsStatus);
router.post("/redeem", createFreePlantRedemption);

module.exports = router;
