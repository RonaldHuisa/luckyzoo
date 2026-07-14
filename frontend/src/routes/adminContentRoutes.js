const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  listAdminSupportChannels,
  createAdminSupportChannel,
  updateAdminSupportChannel,
  deleteAdminSupportChannel,
  listAdminArticles,
  createAdminArticle,
  updateAdminArticle,
  deleteAdminArticle,
} = require("../controllers/adminContentController");
const router = express.Router();
router.use(authMiddleware);
router.use(adminMiddleware);
router.get("/support-channels", listAdminSupportChannels);
router.post("/support-channels", createAdminSupportChannel);
router.patch("/support-channels/:id", updateAdminSupportChannel);
router.delete("/support-channels/:id", deleteAdminSupportChannel);
router.get("/articles", listAdminArticles);
router.post("/articles", createAdminArticle);
router.patch("/articles/:id", updateAdminArticle);
router.delete("/articles/:id", deleteAdminArticle);
module.exports = router;
