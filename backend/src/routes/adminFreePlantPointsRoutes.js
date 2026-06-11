const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getAdminFreePlantRequests,
  approveFreePlantRequest,
  rejectFreePlantRequest,
} = require("../controllers/adminFreePlantPointsController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/free-plants/requests", getAdminFreePlantRequests);
router.post("/free-plants/requests/:id/approve", approveFreePlantRequest);
router.post("/free-plants/requests/:id/reject", rejectFreePlantRequest);

module.exports = router;
