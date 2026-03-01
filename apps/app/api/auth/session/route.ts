import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  toSessionUser,
} from "@/app/lib/auth-session";
import { adminAuth } from "@/app/lib/firebase-admin";

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "No valid session." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return unauthorizedResponse();
  }

  try {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    return NextResponse.json(
      { user: toSessionUser(decodedClaims) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    const response = unauthorizedResponse();
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  }
}

