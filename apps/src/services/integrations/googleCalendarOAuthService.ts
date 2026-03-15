const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar";

type GoogleTokenSuccessResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

type GoogleTokenErrorResponse = {
  error?: string;
  error_description?: string;
};

export type ExchangedGoogleTokens = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  grantedScopes: string[];
  tokenType: string;
  idToken: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getGoogleOAuthConfig() {
  const clientId = requireEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const redirectUri = requireEnv("GOOGLE_OAUTH_REDIRECT_URI");

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function buildGoogleCalendarConsentUrl(state: string): string {
  if (!state.trim()) {
    throw new Error("OAuth state is required.");
  }

  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", CALENDAR_EVENTS_SCOPE);
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeCodeForGoogleTokens(code: string): Promise<ExchangedGoogleTokens> {
  if (!code.trim()) {
    throw new Error("Authorization code is required.");
  }

  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    let errorBody: GoogleTokenErrorResponse | null = null;

    try {
      errorBody = (await response.json()) as GoogleTokenErrorResponse;
    } catch {
      errorBody = null;
    }

    const errorCode = errorBody?.error ?? "google_token_exchange_failed";
    const errorMessage =
      errorBody?.error_description ??
      `Google token endpoint failed with status ${response.status}.`;

    throw new Error(`${errorCode}: ${errorMessage}`);
  }

  let data: GoogleTokenSuccessResponse;
  try {
    data = (await response.json()) as GoogleTokenSuccessResponse;
  } catch {
    throw new Error("Google token endpoint returned invalid JSON.");
  }

  if (!data.access_token || !data.token_type || !Number.isFinite(data.expires_in)) {
    throw new Error("Google token response is missing required fields.");
  }

  const grantedScopes =
    typeof data.scope === "string"
      ? data.scope
          .split(" ")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : [];

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token ?? null,
    grantedScopes,
    tokenType: data.token_type,
    idToken: data.id_token ?? null,
  };
}

export { CALENDAR_EVENTS_SCOPE };
