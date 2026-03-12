const { initializeApp, cert, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db;

const initializeFirebase = () => {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      const credential = typeof serviceAccount === 'string' && serviceAccount.startsWith('{')
        ? JSON.parse(serviceAccount)
        : serviceAccount;
      initializeApp({ credential: cert(credential) });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }
  db = getFirestore();
  return db;
};

const getDb = () => {
  if (!db) {
    throw new Error('Firebase not initialized. Set FIREBASE_SERVICE_ACCOUNT to enable Firestore.');
  }
  return db;
};

module.exports = { initializeFirebase, getDb };
