const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { getAdminStatus } = require("../controllers/adminStatusController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/status", getAdminStatus);

module.exports = router;
