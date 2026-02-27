// General Request Service - Server Entry Point
const { initializeFirebase } = require('./config/firebase');
const app = require('./app');
const config = require('./config');

const start = async () => {
  try {
    initializeFirebase();
    console.log('Connected to Firestore');

    app.listen(config.port, () => {
      console.log(`General Request Service running on port ${config.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
