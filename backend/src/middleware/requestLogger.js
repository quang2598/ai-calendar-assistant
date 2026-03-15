const morgan = require('morgan');
const config = require('../config');

const requestLogger = morgan(config.nodeEnv === 'development' ? 'dev' : 'combined', {
  skip: () => config.nodeEnv === 'test',
});

module.exports = requestLogger;
