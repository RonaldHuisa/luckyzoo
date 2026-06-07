const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/status", (req, res) => {
  return res.json({
    isActive: false,
    disabled: true,
    message: "El evento de invitación no se encuentra disponible en este momento.",
    event: null,
    tasks: [],
    summary: {
      totalRewardUsdt: 0,
      claimableTasks: 0,
      claimedTasks: 0,
    },
  });
});

router.post("/tasks/:taskCode/claim", (req, res) => {
  return res.status(410).json({
    message: "El evento de invitación no se encuentra disponible en este momento.",
  });
});

module.exports = router;
