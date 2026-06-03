const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getSecurityUsers,
  getRepeatedIps,
  getSecurityEvents,
  markSuspicious,
  clearSuspicious,
  banUser,
  unbanUser,
  markIpSuspicious,
} = require("../controllers/adminSecurityController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/security/users", getSecurityUsers);
router.get("/security/repeated-ips", getRepeatedIps);
router.get("/security/users/:userId/events", getSecurityEvents);
router.post("/security/users/:userId/mark-suspicious", markSuspicious);
router.post("/security/users/:userId/clear-suspicious", clearSuspicious);
router.post("/security/users/:userId/ban", banUser);
router.post("/security/users/:userId/unban", unbanUser);
router.post("/security/ips/:ip/mark-suspicious", markIpSuspicious);

module.exports = router;
