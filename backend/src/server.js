// General Request Service - Server Entry Point
const { initializeFirebase } = require('./config/firebase');
const app = require('./app');
const config = require('./config');

const start = async () => {
  try {
    initializeFirebase();
    console.log('Connected to Firestore');
  } catch (err) {
    console.warn('Firestore not available:', err.message);
    console.warn('Server will start without Firestore (auth & history disabled)');
  }

  app.listen(config.port, () => {
    console.log(`General Request Service running on port ${config.port}`);
  });
};

start();
