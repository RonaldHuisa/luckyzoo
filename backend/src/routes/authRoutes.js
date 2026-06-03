const express = require("express");
const { register, login, changePassword } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { registerRateLimiter, loginRateLimiter } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

router.post("/register", registerRateLimiter, register);
router.post("/login", loginRateLimiter, login);
router.post("/change-password", authMiddleware, changePassword);

module.exports = router;