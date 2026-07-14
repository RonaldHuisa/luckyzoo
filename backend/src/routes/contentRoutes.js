const express = require("express");
const { getSupportChannels, listPublishedArticles, getPublishedArticle } = require("../controllers/contentController");
const router = express.Router();
router.get("/support/channels", getSupportChannels);
router.get("/news", listPublishedArticles);
router.get("/news/:slug", getPublishedArticle);
module.exports = router;
