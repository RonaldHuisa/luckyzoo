const express = require("express");
const { register, login, changePassword, captcha, getMe, updateProfile, saveWithdrawalAccount, deleteWithdrawalAccount, redeemCode, getRedeemCodeStatus, getRouletteStatus, spinRoulette } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { registerRateLimiter, loginRateLimiter } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

router.get("/captcha", captcha);
router.post("/register", registerRateLimiter, register);
router.post("/login", loginRateLimiter, login);
router.get("/me", authMiddleware, getMe);
router.put("/profile", authMiddleware, updateProfile);
router.post("/withdrawal-accounts", authMiddleware, saveWithdrawalAccount);
router.delete("/withdrawal-accounts/:accountId", authMiddleware, deleteWithdrawalAccount);
router.post("/change-password", authMiddleware, changePassword);
router.get("/redeem-code/status", authMiddleware, getRedeemCodeStatus);
router.post("/redeem-code", authMiddleware, redeemCode);
router.get("/roulette/status", authMiddleware, getRouletteStatus);
router.post("/roulette/spin", authMiddleware, spinRoulette);

module.exports = router;