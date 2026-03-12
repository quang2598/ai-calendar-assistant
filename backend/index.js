const { onRequest } = require('firebase-functions/v2/https');
const { initializeFirebase } = require('./src/config/firebase');

initializeFirebase();

const app = require('./src/app');

exports.api = onRequest(app);
