const ConversationHistory = require('../models/ConversationHistory');
const ApiError = require('../utils/ApiError');

const ensureConversation = async (uid, conversationId) => {
  if (!conversationId) {
    return await ConversationHistory.createConversation(uid);
  }
  const existing = await ConversationHistory.findById(uid, conversationId);
  if (!existing) {
    throw new ApiError(404, 'Conversation not found');
  }
  return conversationId;
};

const saveMessage = async ({ uid, conversationId, role, text }) => {
  return await ConversationHistory.saveMessage({ uid, conversationId, role, text });
};

const listConversations = async (uid, { page = 1, limit = 20 } = {}) => {
  const { conversations, total } = await ConversationHistory.findByUid(uid, { page, limit });
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

const getConversation = async (uid, conversationId) => {
  const conversation = await ConversationHistory.findById(uid, conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }
  return conversation;
};

const getMessages = async (uid, conversationId) => {
  return await ConversationHistory.getMessages(uid, conversationId);
};

const deleteConversation = async (uid, conversationId) => {
  const conversation = await ConversationHistory.deleteById(uid, conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }
  return conversation;
};

module.exports = {
  ensureConversation,
  saveMessage,
  listConversations,
  getConversation,
  getMessages,
  deleteConversation,
};
