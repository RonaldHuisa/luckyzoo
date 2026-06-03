const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  listAdminPromoClaims,
  getAdminPromoUserDetail,
} = require("../controllers/promoEventController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/promo-event/claims", listAdminPromoClaims);
router.get("/promo-event/users/:userId", getAdminPromoUserDetail);

module.exports = router;
