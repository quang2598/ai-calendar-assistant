import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db } from "./firebase.js";

// ─── extension-conversation ───

/**
 * No-op — message persistence is handled by the backend.
 * Kept for API compatibility with popup.js.
 */
export async function addConversationMessage(uid, role, text) {
  // Backend handles message persistence via /api/chat/send → agent
}

// ─── event-managed-by-agent ───

/**
 * Listen to real-time updates on event-managed-by-agent collection.
 * @param {string} uid
 * @param {function} callback - Called with array of event docs
 * @returns {function} unsubscribe
 */
export function onEventsChanged(uid, callback) {
  const colRef = collection(db, "users", uid, "event-managed-by-agent");
  const q = query(colRef, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(events);
  });
}

// ─── action-history ───

/**
 * Listen to real-time updates on action-history collection.
 * @param {string} uid
 * @param {function} callback - Called with array of action docs
 * @returns {function} unsubscribe
 */
export function onActionHistoryChanged(uid, callback) {
  const colRef = collection(db, "users", uid, "action-history");
  const q = query(colRef, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snapshot) => {
    const actions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(actions);
  });
}
