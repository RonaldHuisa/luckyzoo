const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getStatus,
  checkin,
  submitTikTok,
  adminOverview,
  adminListTiktoks,
  adminReviewTikTok,
} = require("../controllers/prelaunchController");

const router = express.Router();

router.get("/status", authMiddleware, getStatus);
router.post("/checkin", authMiddleware, checkin);
router.post("/tiktok", authMiddleware, submitTikTok);

router.get("/admin/overview", authMiddleware, adminMiddleware, adminOverview);
router.get("/admin/tiktoks", authMiddleware, adminMiddleware, adminListTiktoks);
router.post("/admin/tiktoks/:submissionId/review", authMiddleware, adminMiddleware, adminReviewTikTok);

module.exports = router;
