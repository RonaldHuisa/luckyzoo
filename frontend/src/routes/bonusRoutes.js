const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getStatus, postCheckin, postTaskClaim } = require('../controllers/bonusController');

router.get('/status', authMiddleware, getStatus);
router.post('/checkin', authMiddleware, postCheckin);
router.post('/tasks/claim', authMiddleware, postTaskClaim);

module.exports = router;
