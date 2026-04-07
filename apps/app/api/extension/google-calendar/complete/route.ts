import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/src/lib/firebaseAdmin";
import { exchangeExtensionCodeForGoogleTokens } from "@/src/services/integrations/googleCalendarOAuthService";
import { extractGoogleAccountId } from "@/src/services/integrations/googleIdTokenService";
import {
  GoogleTokenRepositoryError,
  persistGoogleCalendarTokens,
} from "@/src/services/integrations/googleTokenRepository";
import { verifyAndDecodeGoogleOAuthState } from "@/src/services/integrations/googleOAuthStateService";

export const runtime = "nodejs";

type ExtensionGoogleCalendarCompleteRequest = {
  code?: string;
  state?: string;
};

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

function toErrorCode(error: unknown): string {
  if (error instanceof GoogleTokenRepositoryError) {
    return error.code;
  }

  if (error instanceof Error) {
    return error.message.slice(0, 120).replace(/\s+/g, "_").toUpperCase();
  }

  return "UNKNOWN_ERROR";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const firebaseIdToken = parseBearerToken(request);
    const decoded = await verifyFirebaseIdToken(firebaseIdToken);
    const body = (await request.json()) as ExtensionGoogleCalendarCompleteRequest;
    const code = body.code?.trim() ?? "";
    const state = body.state?.trim() ?? "";

    if (!code || !state) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_CODE_OR_STATE",
            message: "code and state are required.",
          },
        },
        { status: 400 },
      );
    }

    const statePayload = verifyAndDecodeGoogleOAuthState(state);
    if (statePayload.uid !== decoded.uid) {
      return NextResponse.json(
        {
          error: {
            code: "UID_STATE_MISMATCH",
            message: "Authenticated user does not match OAuth state.",
          },
        },
        { status: 403 },
      );
    }

    const exchangedTokens = await exchangeExtensionCodeForGoogleTokens(code);
    const googleAccountId = extractGoogleAccountId(exchangedTokens.idToken);
    const persisted = await persistGoogleCalendarTokens({
      uid: statePayload.uid,
      refreshToken: exchangedTokens.refreshToken,
      grantedScopes: exchangedTokens.grantedScopes,
      googleAccountId,
    });

    return NextResponse.json(
      {
        result: {
          code: persisted.usedExistingRefreshToken
            ? "REFRESH_TOKEN_REUSED"
            : "REFRESH_TOKEN_STORED",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: toErrorCode(error),
          message:
            error instanceof Error
              ? error.message
              : "Failed to complete extension Google Calendar OAuth.",
        },
      },
      { status: 400 },
    );
  }
}
