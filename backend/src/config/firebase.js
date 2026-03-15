const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db;

const initializeFirebase = () => {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is required');
    }

    const credential = typeof serviceAccount === 'string' && serviceAccount.startsWith('{')
      ? JSON.parse(serviceAccount)
      : serviceAccount;

    initializeApp({ credential: cert(credential) });
  }
  db = getFirestore();
  return db;
};

const getDb = () => {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return db;
};

module.exports = { initializeFirebase, getDb };
