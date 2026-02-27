const { initializeFirebase } = require('../src/config/firebase');

initializeFirebase();

const app = require('../src/app');

module.exports = app;
