const axios = require('axios');
const config = require('../config');
const ApiError = require('../utils/ApiError');

const agentClient = axios.create({
  baseURL: config.agentServerUrl,
  timeout: 30000,
});

const chat = async (payload) => {
  try {
    const response = await agentClient.post('/api/chat', payload);
    return response.data;
  } catch (err) {
    if (err.response) {
      throw new ApiError(
        err.response.status,
        err.response.data?.error?.message || 'Agent Server error'
      );
    }
    throw new ApiError(502, 'Agent Server unavailable');
  }
};

const getStatus = async () => {
  try {
    const response = await agentClient.get('/api/health');
    return response.data;
  } catch (_err) {
    throw new ApiError(502, 'Agent Server unavailable');
  }
};

module.exports = { chat, getStatus };
