require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  agentServerUrl: process.env.AGENT_SERVER_URL || 'http://localhost:8000',
  nodeEnv: process.env.NODE_ENV || 'development',
};
