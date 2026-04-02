import { config } from "../config.js";
import { auth } from "./firebase.js";

/**
 * Send a chat message via the backend (Next.js → Agent).
 * @param {string} uid - Firebase user ID
 * @param {string} conversationId
 * @param {string} message
 * @returns {Promise<{ text: string, conversationId: string }>}
 */
export async function sendChat(uid, conversationId, message) {
  // Get Firebase ID token for backend auth
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not authenticated. Please sign in again.");

  const res = await fetch(`${config.backendUrl}/api/backend/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, conversationId, message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Backend error: ${res.status}`);
  }

  const data = await res.json();
  const chatData = data.data || data;
  return {
    text: chatData.responseMessage?.text || chatData.response || "No response",
    conversationId: chatData.conversationId || conversationId,
  };
}
