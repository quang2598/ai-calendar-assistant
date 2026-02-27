const ConversationHistory = require('../models/ConversationHistory');
const ApiError = require('../utils/ApiError');

const createConversation = async ({ sessionId, userId, messages, metadata }) => {
  return await ConversationHistory.create({
    sessionId,
    userId,
    messages: messages || [],
    metadata: metadata || {},
  });
};

const listConversations = async (userId, { page = 1, limit = 20 } = {}) => {
  const { conversations, total } = await ConversationHistory.findByUserId(userId, { page, limit });
  return {
    conversations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const getConversation = async (id) => {
  const conversation = await ConversationHistory.findById(id);
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }
  return conversation;
};

const appendMessages = async (id, messages) => {
  const conversation = await ConversationHistory.appendMessages(id, messages);
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }
  return conversation;
};

const deleteConversation = async (id) => {
  const conversation = await ConversationHistory.deleteById(id);
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }
  return conversation;
};

module.exports = {
  createConversation,
  listConversations,
  getConversation,
  appendMessages,
  deleteConversation,
};
