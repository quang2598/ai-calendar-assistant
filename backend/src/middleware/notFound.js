const ApiError = require('../utils/ApiError');

const notFound = (req, _res, next) => {
  next(new ApiError(404, `Not found: ${req.originalUrl}`));
};

module.exports = notFound;
