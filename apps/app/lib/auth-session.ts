import type { NextRequest } from "next/server";

export type SessionUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
};

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === "production";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_MS / 1000,
};

type TokenClaims = {
  uid?: string;
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
};

export function toSessionUser(claims: TokenClaims): SessionUser {
  return {
    uid: claims.uid ?? claims.sub ?? "",
    email: claims.email ?? null,
    displayName: claims.name ?? null,
    photoURL: claims.picture ?? null,
    emailVerified: Boolean(claims.email_verified),
  };
}

function getExpectedOrigin(request: NextRequest): string | null {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return null;
  }

  const protocol =
    request.headers.get("x-forwarded-proto") ??
    (isProduction ? "https" : "http");

  return `${protocol}://${host}`;
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  const expectedOrigin = getExpectedOrigin(request);
  return expectedOrigin === origin;
}

