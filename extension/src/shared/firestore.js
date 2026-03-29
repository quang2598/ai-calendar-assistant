import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "./firebase.js";

// ─── extension-conversation ───

/**
 * Add a message to the extension-conversation collection.
 * @param {string} uid - Firebase user ID
 * @param {"user"|"system"} role
 * @param {string} text
 */
export async function addConversationMessage(uid, role, text) {
  const colRef = collection(db, "users", uid, "extension-conversation");
  return addDoc(colRef, {
    role,
    text,
    createdAt: serverTimestamp(),
  });
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
