const axios = require('axios');
const { getDb } = require('../config/firebase');
const config = require('../config');

const getHealth = async (_req, res) => {
  let firestoreStatus = 'disconnected';
  try {
    await getDb().listCollections();
    firestoreStatus = 'connected';
  } catch (e) {
    firestoreStatus = 'disconnected';
  }

  let agentStatus = 'unknown';
  try {
    const response = await axios.get(`${config.agentServerUrl}/health`, {
      timeout: 3000,
    });
    agentStatus = response.status === 200 ? 'connected' : 'degraded';
  } catch (e) {
    agentStatus = 'disconnected';
  }

  res.json({
    status: 'ok',
    service: 'general-request-service',
    uptime: process.uptime(),
    firestore: firestoreStatus,
    agent: agentStatus,
    timestamp: new Date().toISOString(),
  });
};

module.exports = { getHealth };
