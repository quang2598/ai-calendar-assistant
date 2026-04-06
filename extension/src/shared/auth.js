import { config } from "../config.js";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, signIntoFirebase } from "./firebase.js";

/**
 * Sign in with Google via launchWebAuthFlow (profile only, no calendar).
 */
export async function signInWithGoogle() {
  const redirectUrl = chrome.identity.getRedirectURL();
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ].join(" ");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.webOauthClientId);
  authUrl.searchParams.set("redirect_uri", redirectUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      }
    );
  });

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("No authorization code received.");

  // Exchange code for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.webOauthClientId,
      client_secret: config.webOauthClientSecret,
      redirect_uri: redirectUrl,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(err.error_description || "Sign-in failed.");
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error("No access token received.");

  // Get user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userInfo = await userRes.json();

  // Sign into Firebase
  let firebaseUid = null;
  try {
    firebaseUid = await signIntoFirebase(accessToken);
  } catch (err) {
    console.warn("Firebase sign-in failed:", err);
  }

  await chrome.storage.local.set({ authToken: accessToken, userInfo, firebaseUid });
  return { token: accessToken, userInfo, firebaseUid };
}

/**
 * Sign out.
 */
export async function signOut() {
  await chrome.storage.local.remove([
    "authToken", "userInfo", "firebaseUid",
    "calendarConnected", "calendarConnectedAt",
  ]);
}

/**
 * Connect Google Calendar.
 * - If refresh token exists in Firestore → refresh silently (no consent)
 * - If no refresh token or invalid → full OAuth consent to get one
 */
export async function connectCalendar() {
  await ensureFirebaseAuth();

  const { firebaseUid } = await chrome.storage.local.get(["firebaseUid"]);
  if (!firebaseUid) throw new Error("Please sign in first.");

  const tokenDocRef = doc(db, "users", firebaseUid, "tokens", "google");
  const tokenDoc = await getDoc(tokenDocRef);
  const existingRefreshToken = tokenDoc.exists() ? tokenDoc.data()?.refreshToken : null;

  if (existingRefreshToken) {
    await refreshAccessToken(existingRefreshToken, tokenDocRef);
  } else {
    await fullCalendarOAuthFlow(firebaseUid, tokenDocRef);
  }

  await chrome.storage.local.set({
    calendarConnected: true,
    calendarConnectedAt: Date.now(),
  });
}

/**
 * Refresh access token silently using existing refresh token.
 */
async function refreshAccessToken(refreshToken, tokenDocRef) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.webOauthClientId,
      client_secret: config.webOauthClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    // Refresh token invalid — need full re-auth
    const { firebaseUid } = await chrome.storage.local.get(["firebaseUid"]);
    await fullCalendarOAuthFlow(firebaseUid, tokenDocRef);
    return;
  }

  const tokenData = await tokenRes.json();
  await setDoc(tokenDocRef, {
    accessToken: tokenData.access_token,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Also update local storage so side panel can use it
  await chrome.storage.local.set({ authToken: tokenData.access_token });
}

/**
 * Full OAuth consent flow to get refresh token for Google Calendar.
 */
async function fullCalendarOAuthFlow(firebaseUid, tokenDocRef) {
  const redirectUrl = chrome.identity.getRedirectURL();
  const scopes = "https://www.googleapis.com/auth/calendar";

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.webOauthClientId);
  authUrl.searchParams.set("redirect_uri", redirectUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      }
    );
  });

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("No authorization code received.");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.webOauthClientId,
      client_secret: config.webOauthClientSecret,
      redirect_uri: redirectUrl,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(err.error_description || "Failed to exchange authorization code.");
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("No access token received.");

  // Verify calendar access
  const calRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  if (!calRes.ok) throw new Error("Could not access Google Calendar.");

  // Save tokens to Firestore
  const payload = {
    accessToken: tokenData.access_token,
    updatedAt: serverTimestamp(),
  };
  if (tokenData.refresh_token) {
    payload.refreshToken = tokenData.refresh_token;
  }
  await setDoc(tokenDocRef, payload, { merge: true });

  // Also update local storage so side panel can use it
  await chrome.storage.local.set({ authToken: tokenData.access_token });
}

/**
 * Ensure Firebase SDK is authenticated.
 */
async function ensureFirebaseAuth() {
  const { authToken } = await chrome.storage.local.get(["authToken"]);
  if (authToken) {
    try {
      await signIntoFirebase(authToken);
    } catch {
      throw new Error("Session expired. Please sign in again.");
    }
  }
}

/**
 * Check if calendar connection is still valid (~1 day for unverified apps).
 */
export async function isCalendarConnected() {
  const { calendarConnected, calendarConnectedAt } = await chrome.storage.local.get([
    "calendarConnected", "calendarConnectedAt",
  ]);
  if (!calendarConnected || !calendarConnectedAt) return false;
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  return Date.now() - calendarConnectedAt < twoDaysMs;
}

/**
 * Get stored auth state.
 */
export async function getAuthState() {
  return chrome.storage.local.get(["authToken", "userInfo", "firebaseUid"]);
}
