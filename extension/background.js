import {
  APP_ORIGIN,
  FIREBASE_WEB_API_KEY,
  GOOGLE_EXTENSION_CLIENT_ID,
} from "./shared/config.js";
import {
  defaultSessionState,
  ensureSessionState,
  readSessionState,
  writeSessionState,
} from "./shared/session.js";

function toSerializableUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  return {
    email: typeof user.email === "string" ? user.email : null,
    displayName:
      typeof user.displayName === "string" ? user.displayName : null,
    photoURL: typeof user.photoURL === "string" ? user.photoURL : null,
  };
}

function requireExtensionAuthConfig() {
  const firebaseApiKey = FIREBASE_WEB_API_KEY.trim();
  const googleClientId = GOOGLE_EXTENSION_CLIENT_ID.trim();

  if (!firebaseApiKey) {
    throw new Error(
      "Missing FIREBASE_WEB_API_KEY in extension/shared/config.js.",
    );
  }

  if (!googleClientId) {
    throw new Error(
      "Missing GOOGLE_EXTENSION_CLIENT_ID in extension/shared/config.js.",
    );
  }

  return {
    firebaseApiKey,
    googleClientId,
  };
}

function createRandomString() {
  return crypto.randomUUID();
}

function buildGoogleSignInUrl({ clientId, redirectUri, nonce, state }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("state", state);

  return url.toString();
}

function parseRedirectFragment(redirectedTo) {
  const url = new URL(redirectedTo);
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  return new URLSearchParams(fragment);
}

function parseJwtPayload(token) {
  const tokenParts = token.split(".");
  if (tokenParts.length < 2) {
    throw new Error("Invalid JWT received.");
  }

  try {
    return JSON.parse(
      atob(tokenParts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
  } catch {
    throw new Error("Could not decode JWT payload.");
  }
}

function parseGoogleAuthResult(redirectedTo, expectedState, expectedNonce) {
  const params = parseRedirectFragment(redirectedTo);

  const error = params.get("error");
  if (error) {
    throw new Error(error);
  }

  const state = params.get("state");
  if (state !== expectedState) {
    throw new Error("Google sign-in state validation failed.");
  }

  const googleIdToken = params.get("id_token");
  if (!googleIdToken) {
    throw new Error("Google did not return an ID token.");
  }

  const payload = parseJwtPayload(googleIdToken);
  if (payload.nonce !== expectedNonce) {
    throw new Error("Google sign-in nonce validation failed.");
  }

  return {
    user: {
      email: typeof payload.email === "string" ? payload.email : null,
      displayName: typeof payload.name === "string" ? payload.name : null,
      photoURL: typeof payload.picture === "string" ? payload.picture : null,
    },
    googleIdToken,
  };
}

async function exchangeGoogleTokenForFirebase({
  firebaseApiKey,
  googleIdToken,
}) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
        requestUri: chrome.identity.getRedirectURL(),
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    },
  );

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Firebase sign-in with Google failed.";
    throw new Error(message);
  }

  if (
    typeof payload?.idToken !== "string" ||
    typeof payload?.refreshToken !== "string" ||
    typeof payload?.expiresIn !== "string"
  ) {
    throw new Error("Firebase auth response is missing required fields.");
  }

  const expiresInSeconds = Number(payload.expiresIn);
  const expiresAtMs = Number.isFinite(expiresInSeconds)
    ? Date.now() + expiresInSeconds * 1000
    : null;

  return {
    user: {
      email: typeof payload.email === "string" ? payload.email : null,
      displayName:
        typeof payload.displayName === "string" ? payload.displayName : null,
      photoURL: typeof payload.photoUrl === "string" ? payload.photoUrl : null,
    },
    auth: {
      idToken: payload.idToken,
      refreshToken: payload.refreshToken,
      expiresAtMs,
    },
  };
}

async function initializeUserProfile({ firebaseIdToken }) {
  const response = await fetch(`${APP_ORIGIN}/api/extension/auth/profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Failed to initialize extension auth profile.";
    throw new Error(message);
  }
}

async function signInWithGoogle() {
  const { firebaseApiKey, googleClientId } = requireExtensionAuthConfig();
  const redirectUrl = chrome.identity.getRedirectURL("google");
  const state = createRandomString();
  const nonce = createRandomString();
  const authUrl = buildGoogleSignInUrl({
    clientId: googleClientId,
    redirectUri: redirectUrl,
    nonce,
    state,
  });

  const redirectedTo = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!redirectedTo) {
    throw new Error("Google sign-in did not complete.");
  }

  const googleAuthResult = parseGoogleAuthResult(redirectedTo, state, nonce);
  const firebaseAuthResult = await exchangeGoogleTokenForFirebase({
    firebaseApiKey,
    googleIdToken: googleAuthResult.googleIdToken,
  });
  await initializeUserProfile({
    firebaseIdToken: firebaseAuthResult.auth.idToken,
  });

  const currentState = await readSessionState();
  const nextState = await writeSessionState({
    ...currentState,
    authStatus: "authenticated",
    user: toSerializableUser(firebaseAuthResult.user),
    auth: firebaseAuthResult.auth,
  });

  return nextState;
}

async function signOut() {
  try {
    await chrome.identity.clearAllCachedAuthTokens();
  } catch {
    // This flow does not use getAuthToken, so local session clearing is still enough.
  }

  const nextState = await writeSessionState({
    ...defaultSessionState,
  });

  return nextState;
}

async function initializeExtensionState() {
  await ensureSessionState();
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("VietCalenAI extension installed.");
  void initializeExtensionState();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtensionState();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_SESSION_STATE") {
    void readSessionState().then((sessionState) => {
      sendResponse({ ok: true, sessionState });
    });

    return true;
  }

  if (message?.type === "AUTH_SIGN_IN_WITH_GOOGLE") {
    void signInWithGoogle()
      .then((sessionState) => {
        sendResponse({ ok: true, sessionState });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: {
            message:
              error instanceof Error ? error.message : "Google sign-in failed.",
          },
        });
      });

    return true;
  }

  if (message?.type === "AUTH_SIGN_OUT") {
    void signOut()
      .then((sessionState) => {
        sendResponse({ ok: true, sessionState });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: {
            message: error instanceof Error ? error.message : "Sign out failed.",
          },
        });
      });

    return true;
  }

  return undefined;
});
