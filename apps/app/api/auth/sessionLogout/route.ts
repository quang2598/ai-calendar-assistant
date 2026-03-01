import { NextRequest, NextResponse } from "next/server";

import {
  isSameOriginRequest,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/app/lib/auth-session";
import { adminAuth } from "@/app/lib/firebase-admin";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionCookie) {
    try {
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, false);
      await adminAuth.revokeRefreshTokens(decodedClaims.sub);
    } catch {
      // Always clear cookie, even if token verify/revoke fails.
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });

  return response;
}

