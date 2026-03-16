import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/src/lib/firebaseAdmin";
import { buildGoogleCalendarConsentUrl } from "@/src/services/integrations/googleCalendarOAuthService";
import { createSignedGoogleOAuthState } from "@/src/services/integrations/googleOAuthStateService";

export const runtime = "nodejs";

function parseBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Missing Authorization bearer token.");
  }

  const idToken = authorization.slice("Bearer ".length).trim();
  if (!idToken) {
    throw new Error("Invalid Authorization bearer token.");
  }

  return idToken;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const firebaseIdToken = parseBearerToken(request);
    const decoded = await verifyFirebaseIdToken(firebaseIdToken);

    const state = createSignedGoogleOAuthState(decoded.uid);
    const consentUrl = buildGoogleCalendarConsentUrl(state);

    if (request.headers.get("x-oauth-mode") === "json") {
      return NextResponse.json({ url: consentUrl }, { status: 200 });
    }

    return NextResponse.redirect(consentUrl, { status: 302 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate Google OAuth.";

    return NextResponse.json(
      {
        error: {
          code: "GOOGLE_OAUTH_CONNECT_FAILED",
          message,
        },
      },
      { status: 401 },
    );
  }
}
