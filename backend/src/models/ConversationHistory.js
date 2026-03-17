const { getDb } = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');

const COLLECTION = 'conversations';

const getCollection = () => getDb().collection(COLLECTION);

const create = async (data) => {
  if (Array.isArray(data)) {
    const results = [];
    for (const item of data) {
      results.push(await create(item));
    }
    return results;
  }

  const now = new Date().toISOString();
  const doc = {
    sessionId: data.sessionId,
    userId: data.userId,
    messages: (data.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || now,
    })),
    metadata: {
      source: (data.metadata && data.metadata.source) || 'web',
      agentModel: (data.metadata && data.metadata.agentModel) || null,
    },
    createdAt: now,
    updatedAt: now,
  };

  const ref = await getCollection().add(doc);
  return { id: ref.id, ...doc };
};

const findByUserId = async (userId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [snapshot, countSnapshot] = await Promise.all([
    getCollection()
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get(),
    getCollection()
      .where('userId', '==', userId)
      .count()
      .get(),
  ]);

  const conversations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const total = countSnapshot.data().count;

  return { conversations, total };
};

const findById = async (id) => {
  const doc = await getCollection().doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

const appendMessages = async (id, messages) => {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const now = new Date().toISOString();
  const newMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp || now,
  }));

  await docRef.update({
    messages: FieldValue.arrayUnion(...newMessages),
    updatedAt: now,
  });

  const updated = await docRef.get();
  return { id: updated.id, ...updated.data() };
};

const deleteById = async (id) => {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;
  const data = { id: doc.id, ...doc.data() };
  await docRef.delete();
  return data;
};

const countDocuments = async (filter = {}) => {
  let query = getCollection();
  for (const [field, value] of Object.entries(filter)) {
    query = query.where(field, '==', value);
  }
  const snapshot = await query.count().get();
  return snapshot.data().count;
};

module.exports = { create, findByUserId, findById, appendMessages, deleteById, countDocuments };
