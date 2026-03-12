const agentService = require("../services/agentService");
const historyService = require("../services/historyService");
const ApiError = require("../utils/ApiError");

/**
 * POST /api/agent/chat
 *
 * Frontend sends:  { uid, conversationId, message }
 * Flow (mirrors mock server):
 *   1. Ensure conversation exists (create if new)
 *   2. Save user message
 *   3. Call agent server
 *   4. Save agent response message
 *   5. Return { data: { conversationId, responseMessage } }
 */
const chat = async (req, res, next) => {
  try {
    const { uid, conversationId, message } = req.body;
    const resolvedUid = req.user?.uid || uid;
    if (!message) {
      throw new ApiError(400, "message is required");
    }

    // 1. Ensure conversation exists (create if conversationId is null)
    const resolvedConversationId = await historyService.ensureConversation(
      resolvedUid,
      conversationId || null,
    );

    // 2. Save user message
    await historyService.saveMessage({
      uid: resolvedUid,
      conversationId: resolvedConversationId,
      role: "user",
      text: message,
    });

    // 3. Call agent server
    const result = await agentService.chat({
      message,
      conversationId: resolvedConversationId,
      uid: resolvedUid,
    });

    const responseText = result.answer || result.message || "";

    // 4. Save agent response message
    const responseMessageId = await historyService.saveMessage({
      uid: resolvedUid,
      conversationId: resolvedConversationId,
      role: "system",
      text: responseText,
    });

    // 5. Return response
    res.json({
      data: {
        conversationId: resolvedConversationId,
        responseMessage: {
          id: responseMessageId,
          role: "system",
          text: responseText,
        },
      },
    });
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
