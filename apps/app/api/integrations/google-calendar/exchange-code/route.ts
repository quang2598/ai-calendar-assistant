import { NextRequest, NextResponse } from "next/server";

import { persistGoogleCalendarTokens } from "@/src/services/integrations/googleTokenRepository";

export const runtime = "nodejs";

type ExchangeCodeBody = {
  uid?: unknown;
  code?: unknown;
  redirectUri?: unknown;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ExchangeCodeBody;
  try {
    body = (await request.json()) as ExchangeCodeBody;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";

  if (!uid || !code || !redirectUri) {
    return NextResponse.json(
      { error: { code: "MISSING_FIELDS", message: "uid, code, and redirectUri are required." } },
      { status: 400 },
    );
  }

  try {
    // Exchange code for tokens
    const clientId = requireEnv("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({})) as Record<string, unknown>;
      const errorMsg = typeof errorData.error_description === "string"
        ? errorData.error_description
        : `Token exchange failed with status ${tokenResponse.status}`;
      return NextResponse.json(
        { error: { code: "TOKEN_EXCHANGE_FAILED", message: errorMsg } },
        { status: 400 },
      );
    }

    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const scope = tokenData.scope;

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json(
        { error: { code: "NO_ACCESS_TOKEN", message: "No access token received." } },
        { status: 400 },
      );
    }

    // Parse granted scopes
    const grantedScopes = typeof scope === "string"
      ? scope.split(" ").map((s) => s.trim()).filter(Boolean)
      : [];

    // Save tokens to Firestore via Admin SDK
    await persistGoogleCalendarTokens({
      uid,
      refreshToken: typeof refreshToken === "string" ? refreshToken : null,
      grantedScopes,
    });

    return NextResponse.json({ success: true, accessToken }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to exchange code.";
    return NextResponse.json(
      { error: { code: "EXCHANGE_FAILED", message } },
      { status: 500 },
    );
  }
}
