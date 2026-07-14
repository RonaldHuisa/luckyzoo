const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  listAdminTickets,
  readAdminTicket,
  addAdminTicketMessage,
  updateAdminTicketStatus,
  uploadSupportImages,
} = require("../controllers/supportController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/tickets", listAdminTickets);
router.get("/tickets/:ticketId", readAdminTicket);
router.post("/tickets/:ticketId/messages", uploadSupportImages, addAdminTicketMessage);
router.patch("/tickets/:ticketId", updateAdminTicketStatus);

module.exports = router;
