import { SESSION_STORAGE_KEY, defaultSessionState } from "../shared/session.js";

const appElement = document.querySelector("[data-popup-app]");
let currentState = defaultSessionState;
let pendingAction = null;
let errorMessage = null;
let isCheckingGeolocation = false;

function getUserLabel(user) {
  if (!user) {
    return "Not logged in.";
  }

  return user.displayName || user.email || "You are logged in!";
}

function getCalendarStatusText(calendar) {
  if (!calendar || calendar.status === "disconnected") {
    return "Google Calendar is not connected yet.";
  }

  if (calendar.status === "connecting") {
    return "Connecting Google Calendar...";
  }

  return "Google Calendar is connected.";
}

function getGeolocationStatusText(permissions) {
  const status = permissions?.geolocation ?? "unknown";

  if (status === "granted") {
    return "Location access is enabled.";
  }

  return "Location access is not enabled yet.";
}

function getGeolocationSetupMessage(permissions) {
  const status = permissions?.geolocation ?? "unknown";

  if (status === "granted") {
    return "Location access is enabled.";
  }

  if (status === "denied") {
    return "Turning on location would help VietCalenAI personalize the experience better. You can check location access again whenever you're ready.";
  }

  return "Turning on location would help VietCalenAI personalize the experience better. Check location access to see if it is available.";
}

function getMicrophoneStatusText(permissions) {
  const status = permissions?.microphone ?? "unknown";

  if (status === "granted") {
    return "Microphone access is enabled.";
  }

  return "Microphone access is not enabled yet.";
}

function getMicrophoneSetupMessage(permissions) {
  const status = permissions?.microphone ?? "unknown";

  if (status === "granted") {
    return "Microphone access is enabled.";
  }

  if (status === "denied") {
    return "Turning on microphone would help VietCalenAI support voice interactions better. Check microphone access and try again whenever you're ready.";
  }

  return "Turning on microphone would help VietCalenAI support voice interactions better. Check microphone access to verify voice input is available.";
}

function getActionLabel(action, calendarStatus) {
  if (action === "sign-in") {
    return pendingAction === "sign-in" ? "Opening Google..." : "Continue with Google";
  }

  if (action === "request-geolocation") {
    if (pendingAction === "request-geolocation") {
      return "Checking Location...";
    }

    return currentState.permissions?.geolocation === "denied"
      ? "Try Location Again"
      : "Check Location Access";
  }

  if (action === "test-microphone") {
    return currentState.permissions?.microphone === "denied"
      ? "Open Microphone Setup"
      : "Set Up Microphone";
  }

  if (action === "sign-out") {
    return pendingAction === "sign-out" ? "Working..." : "Sign out";
  }

  const idleLabel =
    calendarStatus === "connected"
      ? "Reconnect Google Calendar"
      : "Connect Google Calendar";

  return pendingAction === "connect-calendar" ? "Opening Google..." : idleLabel;
}

function setPermissionState(nextPermissions) {
  const nextState = {
    ...currentState,
    permissions: {
      ...currentState.permissions,
      ...nextPermissions,
    },
  };

  currentState = nextState;
  chrome.storage.local.set({
    [SESSION_STORAGE_KEY]: nextState,
  });
  render(nextState);
}

async function requestGeolocationPermission() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not available in this extension popup.");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("VietCalenAI geolocation:", {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setPermissionState({ geolocation: "granted" });
        resolve();
      },
      (error) => {
        if (error?.code === error.PERMISSION_DENIED) {
          setPermissionState({ geolocation: "denied" });
          reject(new Error("Location access is not available."));
          return;
        }

        setPermissionState({ geolocation: "denied" });
        reject(
          new Error(
            typeof error?.message === "string" && error.message
              ? error.message
              : "Location access is not available.",
          ),
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 1000,
        maximumAge: 0,
      },
    );
  });
}

async function checkGeolocationAccess() {
  pendingAction = "request-geolocation";
  errorMessage = null;
  isCheckingGeolocation = true;
  render(currentState);

  try {
    await requestGeolocationPermission();
  } catch {
    errorMessage = null;
    render(currentState);
  } finally {
    pendingAction = null;
    isCheckingGeolocation = false;
    render(currentState);
  }
}

async function ensureAuthenticatedGeolocationCheck(state) {
  if (state.authStatus !== "authenticated" || pendingAction || isCheckingGeolocation) {
    return;
  }

  await checkGeolocationAccess();
}

function render(state = defaultSessionState) {
  if (!appElement) {
    return;
  }

  currentState = state;

  if (state.authStatus === "authenticated") {
    const needsLocationSetup =
      state.permissions?.geolocation !== "granted" && !isCheckingGeolocation;
    const needsMicrophoneSetup = state.permissions?.microphone !== "granted";

    appElement.innerHTML = `
      <section class="card">
        <span class="badge">Popup</span>
        <h1 class="title">VietCalenAI</h1>
        <p class="text">You are logged in!</p>
        <p class="note">${getUserLabel(state.user)}</p>
        <p class="note">${getCalendarStatusText(state.calendar)}</p>
        <p class="note">${getGeolocationStatusText(state.permissions)}</p>
        <p class="note">${getMicrophoneStatusText(state.permissions)}</p>
        ${
          needsLocationSetup
            ? `<p class="note">${getGeolocationSetupMessage(state.permissions)}</p>`
            : ""
        }
        ${
          needsMicrophoneSetup
            ? `<p class="note">${getMicrophoneSetupMessage(state.permissions)}</p>`
            : ""
        }
        ${
          errorMessage
            ? `<p class="message message-error">${errorMessage}</p>`
            : ""
        }
        <div class="actions">
          ${
            needsLocationSetup
              ? `<button class="button" data-action="request-geolocation" ${
                  pendingAction ? "disabled" : ""
                }>
                  ${getActionLabel("request-geolocation", state.calendar?.status)}
                </button>`
              : ""
          }
          <button class="button button-secondary" data-action="test-microphone" ${
            pendingAction ? "disabled" : ""
          }>
            ${getActionLabel("test-microphone", state.calendar?.status)}
          </button>
          <button class="button" data-action="connect-calendar" ${
            pendingAction ? "disabled" : ""
          }>
            ${getActionLabel("connect-calendar", state.calendar?.status)}
          </button>
          <button class="button button-secondary" data-action="sign-out" ${
            pendingAction ? "disabled" : ""
          }>
            ${getActionLabel("sign-out", state.calendar?.status)}
          </button>
        </div>
      </section>
    `;
    return;
  }

  appElement.innerHTML = `
    <section class="card">
      <span class="badge">Popup</span>
      <h1 class="title">VietCalenAI</h1>
      <p class="text">Not logged in.</p>
      <p class="note">
        Sign in with Google to activate the extension session.
      </p>
      ${
        errorMessage
          ? `<p class="message message-error">${errorMessage}</p>`
          : ""
      }
      <div class="actions">
        <button class="button" data-action="sign-in" ${pendingAction ? "disabled" : ""}>
          ${getActionLabel("sign-in", state.calendar?.status)}
        </button>
      </div>
    </section>
  `;
}

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
  const sessionState = response?.sessionState ?? defaultSessionState;
  render(sessionState);
  await ensureAuthenticatedGeolocationCheck(sessionState);
}

async function handleAuthAction(action) {
  pendingAction = action;
  errorMessage = null;
  render(currentState);

  if (action === "request-geolocation") {
    await checkGeolocationAccess();
    return;
  }

  if (action === "test-microphone") {
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL("request-microphone/index.html"),
      });
    } catch {
      errorMessage = null;
      render(currentState);
    } finally {
      pendingAction = null;
      render(currentState);
    }

    return;
  }

  const messageTypeMap = {
    "connect-calendar": "CALENDAR_CONNECT_GOOGLE",
    "sign-in": "AUTH_SIGN_IN_WITH_GOOGLE",
    "sign-out": "AUTH_SIGN_OUT",
  };
  const messageType = messageTypeMap[action];

  try {
    const response = await chrome.runtime.sendMessage({ type: messageType });
    if (!response?.ok) {
      throw new Error(response?.error?.message ?? "Authentication failed.");
    }

    const nextState = response.sessionState ?? currentState;
    render(nextState);

    if (action === "sign-in") {
      await ensureAuthenticatedGeolocationCheck(nextState);
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Authentication failed.";
    render(currentState);
  } finally {
    pendingAction = null;
    render(currentState);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SESSION_STORAGE_KEY]) {
    return;
  }

  render(changes[SESSION_STORAGE_KEY].newValue ?? defaultSessionState);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  if (!action || pendingAction) {
    return;
  }

  void handleAuthAction(action);
});

void loadState();
