const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getUserSupportSummary,
  listUserTickets,
  createUserTicket,
  readUserTicket,
  addUserTicketMessage,
  uploadSupportImages,
} = require("../controllers/supportController");

const router = express.Router();

router.use(authMiddleware);

router.get("/summary", getUserSupportSummary);
router.get("/tickets", listUserTickets);
router.post("/tickets", uploadSupportImages, createUserTicket);
router.get("/tickets/:ticketId", readUserTicket);
router.post("/tickets/:ticketId/messages", uploadSupportImages, addUserTicketMessage);

module.exports = router;
