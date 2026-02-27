const agentService = require('../services/agentService');
const ApiError = require('../utils/ApiError');

const chat = async (req, res, next) => {
  try {
    const { message, sessionId, userId } = req.body;
    if (!message) {
      throw new ApiError(400, 'message is required');
    }
    const result = await agentService.chat({ message, sessionId, userId });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const status = async (_req, res, next) => {
  try {
    const result = await agentService.getStatus();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { chat, status };
