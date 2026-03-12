const express = require('express');
const agentController = require('../controllers/agentController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/chat', verifyToken, agentController.chat);
router.get('/status', agentController.status);

module.exports = router;
