export const SESSION_STORAGE_KEY = "vietcalenai.session";

export const defaultSessionState = {
  authStatus: "anonymous",
  user: null,
  auth: {
    idToken: null,
    refreshToken: null,
    expiresAtMs: null,
  },
  calendar: {
    status: "disconnected",
    resultCode: null,
  },
  permissions: {
    geolocation: "unknown",
    microphone: "unknown",
  },
};

function normalizeUser(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    email: typeof value.email === "string" ? value.email : null,
    displayName:
      typeof value.displayName === "string" ? value.displayName : null,
    photoURL: typeof value.photoURL === "string" ? value.photoURL : null,
  };
}

function normalizeCalendar(value) {
  if (!value || typeof value !== "object") {
    return defaultSessionState.calendar;
  }

  const status = value.status;
  return {
    status:
      status === "connected" || status === "connecting"
        ? status
        : "disconnected",
    resultCode:
      typeof value.resultCode === "string" ? value.resultCode : null,
  };
}

function normalizeAuth(value) {
  if (!value || typeof value !== "object") {
    return defaultSessionState.auth;
  }

  return {
    idToken: typeof value.idToken === "string" ? value.idToken : null,
    refreshToken:
      typeof value.refreshToken === "string" ? value.refreshToken : null,
    expiresAtMs:
      typeof value.expiresAtMs === "number" && Number.isFinite(value.expiresAtMs)
        ? value.expiresAtMs
        : null,
  };
}

function normalizePermissionStatus(value) {
  return value === "granted" || value === "denied" ? value : "unknown";
}

function normalizePermissions(value) {
  if (!value || typeof value !== "object") {
    return defaultSessionState.permissions;
  }

  return {
    geolocation: normalizePermissionStatus(value.geolocation),
    microphone: normalizePermissionStatus(value.microphone),
  };
}

export function normalizeSessionState(value) {
  if (!value || typeof value !== "object") {
    return structuredClone(defaultSessionState);
  }

  const authStatus = value.authStatus;
  return {
    authStatus: authStatus === "authenticated" ? "authenticated" : "anonymous",
    user: normalizeUser(value.user),
    auth: normalizeAuth(value.auth),
    calendar: normalizeCalendar(value.calendar),
    permissions: normalizePermissions(value.permissions),
  };
}

export async function readSessionState() {
  const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  return normalizeSessionState(stored[SESSION_STORAGE_KEY]);
}

export async function writeSessionState(nextState) {
  const normalized = normalizeSessionState(nextState);
  await chrome.storage.local.set({
    [SESSION_STORAGE_KEY]: normalized,
  });
  return normalized;
}

export async function ensureSessionState() {
  const current = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  if (current[SESSION_STORAGE_KEY]) {
    return normalizeSessionState(current[SESSION_STORAGE_KEY]);
  }

  return writeSessionState(defaultSessionState);
}
