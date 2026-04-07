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

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getGoogleOAuthConfig(
  envNames: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
): GoogleOAuthConfig {
  const clientId = requireEnv(envNames.clientId);
  const clientSecret = requireEnv(envNames.clientSecret);
  const redirectUri = requireEnv(envNames.redirectUri);

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

function getWebGoogleOAuthConfig(): GoogleOAuthConfig {
  return getGoogleOAuthConfig({
    clientId: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecret: "GOOGLE_OAUTH_CLIENT_SECRET",
    redirectUri: "GOOGLE_OAUTH_REDIRECT_URI",
  });
}

function getExtensionGoogleOAuthConfig(): GoogleOAuthConfig {
  return getGoogleOAuthConfig({
    clientId: "GOOGLE_EXTENSION_CALENDAR_CLIENT_ID",
    clientSecret: "GOOGLE_EXTENSION_CALENDAR_CLIENT_SECRET",
    redirectUri: "GOOGLE_EXTENSION_CALENDAR_REDIRECT_URI",
  });
}

function buildConsentUrl(state: string, config: GoogleOAuthConfig): string {
  if (!state.trim()) {
    throw new Error("OAuth state is required.");
  }

  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", CALENDAR_EVENTS_SCOPE);
  url.searchParams.set("state", state);

  return url.toString();
}

function buildTokenExchangeBody(code: string, config: GoogleOAuthConfig): URLSearchParams {
  if (!code.trim()) {
    throw new Error("Authorization code is required.");
  }

  return new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
}

export function buildGoogleCalendarConsentUrl(state: string): string {
  return buildConsentUrl(state, getWebGoogleOAuthConfig());
}

export function buildExtensionGoogleCalendarConsentUrl(state: string): string {
  return buildConsentUrl(state, getExtensionGoogleOAuthConfig());
}

async function exchangeCodeForGoogleTokensWithConfig(
  code: string,
  config: GoogleOAuthConfig,
): Promise<ExchangedGoogleTokens> {
  const body = buildTokenExchangeBody(code, config);

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

export async function exchangeCodeForGoogleTokens(code: string): Promise<ExchangedGoogleTokens> {
  return exchangeCodeForGoogleTokensWithConfig(code, getWebGoogleOAuthConfig());
}

export async function exchangeExtensionCodeForGoogleTokens(
  code: string,
): Promise<ExchangedGoogleTokens> {
  return exchangeCodeForGoogleTokensWithConfig(code, getExtensionGoogleOAuthConfig());
}

export { CALENDAR_EVENTS_SCOPE };
