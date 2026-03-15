const config = require('../config');

const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[Error] ${statusCode} - ${message}`);
  if (config.nodeEnv === 'development' && statusCode === 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: {
      message,
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    },
  });
};

module.exports = errorHandler;
