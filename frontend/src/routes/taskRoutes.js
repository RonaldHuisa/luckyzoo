const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getTasksDashboard, completeVipTask } = require("../controllers/taskController");
const router = express.Router();
router.get("/dashboard", authMiddleware, getTasksDashboard);
router.post("/complete", authMiddleware, completeVipTask);
module.exports = router;
