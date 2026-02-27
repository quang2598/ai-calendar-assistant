const express = require('express');
const healthRoutes = require('./healthRoutes');
const historyRoutes = require('./historyRoutes');
const agentRoutes = require('./agentRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/history', historyRoutes);
router.use('/agent', agentRoutes);

module.exports = router;
