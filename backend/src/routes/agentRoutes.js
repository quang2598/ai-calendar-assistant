const express = require('express');
const agentController = require('../controllers/agentController');

const router = express.Router();

router.post('/chat', agentController.chat);
router.get('/status', agentController.status);

module.exports = router;
