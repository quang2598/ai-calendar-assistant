const historyService = require('../services/historyService');
const ApiError = require('../utils/ApiError');

const create = async (req, res, next) => {
  try {
    const { sessionId, userId, messages, metadata } = req.body;
    if (!sessionId || !userId) {
      throw new ApiError(400, 'sessionId and userId are required');
    }
    const conversation = await historyService.createConversation({
      sessionId,
      userId,
      messages,
      metadata,
    });
    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const { userId, page, limit } = req.query;
    if (!userId) {
      throw new ApiError(400, 'userId query parameter is required');
    }
    const result = await historyService.listConversations(userId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const conversation = await historyService.getConversation(req.params.id);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new ApiError(400, 'messages array is required and must not be empty');
    }
    const conversation = await historyService.appendMessages(req.params.id, messages);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    await historyService.deleteConversation(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list, getOne, update, remove };
