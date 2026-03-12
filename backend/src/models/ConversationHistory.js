const { getDb } = require('../config/firebase');

/**
 * Firestore structure (matches frontend mock server):
 *   users/{uid}/conversations/{conversationId}            → { createdAt, lastUpdated, title }
 *   users/{uid}/conversations/{conversationId}/messages   → { createdAt, role, text }
 */

const getUserConversationsCol = (uid) =>
  getDb().collection('users').doc(uid).collection('conversations');

const getMessagesCol = (uid, conversationId) =>
  getUserConversationsCol(uid).doc(conversationId).collection('messages');

function pad2(value) {
  return value.toString().padStart(2, '0');
}

function formatConversationTitle(date = new Date()) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());
  return `Conversation on ${year}${month}${day}-${hour}${minute}${second}`;
}

/**
 * Create a new conversation document under users/{uid}/conversations
 * Returns the new conversationId.
 */
const createConversation = async (uid) => {
  const now = new Date().toISOString();
  const col = getUserConversationsCol(uid);
  const ref = await col.add({
    createdAt: now,
    lastUpdated: now,
    title: formatConversationTitle(),
  });
  return ref.id;
};

/**
 * Save a single message to users/{uid}/conversations/{conversationId}/messages
 * Returns the new message document id.
 */
const saveMessage = async ({ uid, conversationId, role, text }) => {
  const now = new Date().toISOString();
  const col = getMessagesCol(uid, conversationId);
  const ref = await col.add({
    createdAt: now,
    role,
    text,
  });

  // Update lastUpdated on the conversation
  await getUserConversationsCol(uid).doc(conversationId).update({
    lastUpdated: now,
  });

  return ref.id;
};

/**
 * Get a conversation document by id
 */
const findById = async (uid, conversationId) => {
  const doc = await getUserConversationsCol(uid).doc(conversationId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

/**
 * List conversations for a user, ordered by lastUpdated desc
 */
const findByUid = async (uid, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const col = getUserConversationsCol(uid);

  const [snapshot, countSnapshot] = await Promise.all([
    col.orderBy('lastUpdated', 'desc').offset(offset).limit(limit).get(),
    col.count().get(),
  ]);

  const conversations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const total = countSnapshot.data().count;
  return { conversations, total };
};

/**
 * Get all messages for a conversation
 */
const getMessages = async (uid, conversationId) => {
  const snapshot = await getMessagesCol(uid, conversationId)
    .orderBy('createdAt', 'asc')
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

/**
 * Delete a conversation and its messages subcollection
 */
const deleteById = async (uid, conversationId) => {
  const convRef = getUserConversationsCol(uid).doc(conversationId);
  const doc = await convRef.get();
  if (!doc.exists) return null;

  // Delete all messages in subcollection
  const messagesSnapshot = await getMessagesCol(uid, conversationId).get();
  const batch = getDb().batch();
  messagesSnapshot.docs.forEach((msgDoc) => batch.delete(msgDoc.ref));
  batch.delete(convRef);
  await batch.commit();

  return { id: doc.id, ...doc.data() };
};

module.exports = {
  createConversation,
  saveMessage,
  findById,
  findByUid,
  getMessages,
  deleteById,
};
