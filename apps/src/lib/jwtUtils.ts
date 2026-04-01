/**
 * JWT utility for generating user authentication tokens
 * to send to the Python agent backend
 */

import jwt from "jsonwebtoken";

export class JWTGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JWTGenerationError";
  }
}

function getSecretKey(): string {
  const secret = (process.env.JWT_SECRET_KEY || "").trim();
  if (!secret) {
    throw new JWTGenerationError(
      "JWT_SECRET_KEY environment variable is not set",
    );
  }
  return secret;
}

export interface UserTokenPayload {
  uid: string;
  iat?: number;
  exp?: number;
  iss?: string;
}

/**
 * Generate a JWT token for a user to authenticate with the agent API
 * @param uid - User ID from Firebase Authentication
 * @param tokenTtlHours - Token time-to-live in hours (default: 1)
 * @returns JWT token string
 */
export function generateUserToken(
  uid: string,
  tokenTtlHours: number = 1,
): string {
  if (!uid || uid.trim().length === 0) {
    throw new JWTGenerationError("uid cannot be empty");
  }

  const secret = getSecretKey();
  const now = Math.floor(Date.now() / 1000);
  const expirationSeconds = tokenTtlHours * 3600;

  const payload: UserTokenPayload = {
    uid: uid.trim(),
    iat: now,
    exp: now + expirationSeconds,
    iss: "ai-calendar-backend",
  };

  try {
    const token = jwt.sign(payload, secret, { algorithm: "HS256" });
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JWTGenerationError(`Failed to generate JWT: ${message}`);
  }
}
