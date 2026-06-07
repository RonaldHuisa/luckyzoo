const express = require("express");
const { getPrices } = require("../controllers/marketController");

const router = express.Router();

router.get("/prices", getPrices);

module.exports = router;
