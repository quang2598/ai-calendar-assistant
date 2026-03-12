const historyService = require("../services/historyService");
const ApiError = require("../utils/ApiError");

const list = async (req, res, next) => {
  try {
    const uid = req.query.uid || req.user?.uid;
    const { page, limit } = req.query;
    if (!uid) {
      throw new ApiError(400, "uid query parameter is required");
    }
    const result = await historyService.listConversations(uid, {
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
    const uid = req.query.uid || req.user?.uid;
    if (!uid) {
      throw new ApiError(400, "uid is required");
    }
    const conversation = await historyService.getConversation(uid, req.params.id);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
};

const getMessages = async (req, res, next) => {
  try {
    const uid = req.query.uid || req.user?.uid;
    if (!uid) {
      throw new ApiError(400, "uid is required");
    }
    const messages = await historyService.getMessages(uid, req.params.id);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const uid = req.query.uid || req.user?.uid;
    if (!uid) {
      throw new ApiError(400, "uid is required");
    }
    await historyService.deleteConversation(uid, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getOne, getMessages, remove };
