const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getMyWallet } = require("../controllers/walletController");
const { listPaymentNetworks } = require("../utils/paymentNetworks");

const router = express.Router();

router.get("/me", authMiddleware, getMyWallet);

router.get("/networks", authMiddleware, (req, res) => {
  res.json({ networks: listPaymentNetworks() });
});

module.exports = router;