import { config } from "../config.js";

/**
 * Send a chat message to the agent API.
 * @param {string} uid - Firebase user ID
 * @param {string} conversationId
 * @param {string} message
 * @returns {Promise<{ text: string, conversationId: string }>}
 */
export async function sendChat(uid, conversationId, message) {
  const res = await fetch(config.agentChatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, conversationId, message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || `Agent error: ${res.status}`);
  }

  const data = await res.json();
  return {
    text: data.responseMessage?.text || data.response || "No response",
    conversationId: data.conversationId || conversationId,
  };
}
