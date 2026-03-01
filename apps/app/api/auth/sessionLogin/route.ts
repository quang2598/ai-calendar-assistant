import { NextRequest, NextResponse } from "next/server";

import {
  isSameOriginRequest,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_MS,
  toSessionUser,
} from "@/app/lib/auth-session";
import { adminAuth } from "@/app/lib/firebase-admin";

type SessionLoginBody = {
  idToken?: string;
};

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: SessionLoginBody;
  try {
    body = (await request.json()) as SessionLoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.idToken || typeof body.idToken !== "string") {
    return NextResponse.json({ error: "idToken is required." }, { status: 400 });
  }

  try {
    const [sessionCookie, decodedIdToken] = await Promise.all([
      adminAuth.createSessionCookie(body.idToken, { expiresIn: SESSION_MAX_AGE_MS }),
      adminAuth.verifyIdToken(body.idToken),
    ]);

    const response = NextResponse.json({ user: toSessionUser(decodedIdToken) });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, SESSION_COOKIE_OPTIONS);

    return response;
  } catch {
    return NextResponse.json(
      { error: "Could not establish session." },
      { status: 401 },
    );
  }
}

