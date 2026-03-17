import { NextRequest, NextResponse } from "next/server";

import { exchangeCodeForGoogleTokens } from "@/src/services/integrations/googleCalendarOAuthService";
import {
  GoogleTokenRepositoryError,
  persistGoogleCalendarTokens,
} from "@/src/services/integrations/googleTokenRepository";
import { verifyAndDecodeGoogleOAuthState } from "@/src/services/integrations/googleOAuthStateService";

export const runtime = "nodejs";

function extractGoogleAccountId(idToken: string | null): string | null {
  if (!idToken) {
    return null;
  }

  const tokenParts = idToken.split(".");
  if (tokenParts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(tokenParts[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function buildAppRedirect(request: NextRequest, status: "success" | "error", code: string): URL {
  const redirectUrl = new URL("/", request.nextUrl.origin);

  if (status === "success") {
    redirectUrl.searchParams.set("googleCalendar", "connected");
    redirectUrl.searchParams.set("result", code);
  } else {
    redirectUrl.searchParams.set("googleCalendar", "error");
    redirectUrl.searchParams.set("code", code);
  }

  return redirectUrl;
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(buildAppRedirect(request, "error", oauthError), {
      status: 302,
    });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const state = request.nextUrl.searchParams.get("state")?.trim() ?? "";

  if (!code || !state) {
    return NextResponse.redirect(buildAppRedirect(request, "error", "MISSING_CODE_OR_STATE"), {
      status: 302,
    });
  }

  try {
    const statePayload = verifyAndDecodeGoogleOAuthState(state);
    const exchangedTokens = await exchangeCodeForGoogleTokens(code);
    const googleAccountId = extractGoogleAccountId(exchangedTokens.idToken);

    const persisted = await persistGoogleCalendarTokens({
      uid: statePayload.uid,
      refreshToken: exchangedTokens.refreshToken,
      grantedScopes: exchangedTokens.grantedScopes,
      googleAccountId,
    });

    const resultCode = persisted.usedExistingRefreshToken
      ? "REFRESH_TOKEN_REUSED"
      : "REFRESH_TOKEN_STORED";

    return NextResponse.redirect(buildAppRedirect(request, "success", resultCode), {
      status: 302,
    });
  } catch (error) {
    return NextResponse.redirect(buildAppRedirect(request, "error", toErrorCode(error)), {
      status: 302,
    });
  }
}
