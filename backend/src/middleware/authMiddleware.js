const { getAuth } = require("firebase-admin/auth");
const ApiError = require("../utils/ApiError");

/**
 * Verifies Firebase ID token from Authorization header.
 * Attaches decoded token to req.user on success.
 */
const verifyToken = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Missing or invalid Authorization header");
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (err) {
    if (err instanceof ApiError) {
      return next(err);
    }
    next(new ApiError(401, "Invalid or expired token"));
  }
};

module.exports = { verifyToken };
