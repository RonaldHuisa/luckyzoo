const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  listAdminDeposits,
  getAdminDepositPreview,
  sendDepositGas,
  collectDeposit,
  refreshDepositStatus,
} = require("../controllers/adminDepositController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/deposits", listAdminDeposits);
router.get("/deposits/:depositId/preview", getAdminDepositPreview);
router.post("/deposits/:depositId/send-gas", sendDepositGas);
router.post("/deposits/:depositId/collect", collectDeposit);
router.post("/deposits/:depositId/refresh", refreshDepositStatus);

module.exports = router;
