import { SESSION_STORAGE_KEY, defaultSessionState } from "../shared/session.js";

const appElement = document.querySelector("[data-popup-app]");
let currentState = defaultSessionState;
let pendingAction = null;
let errorMessage = null;

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

function getActionLabel(action, calendarStatus) {
  if (action === "sign-in") {
    return pendingAction === "sign-in" ? "Opening Google..." : "Continue with Google";
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

function render(state = defaultSessionState) {
  if (!appElement) {
    return;
  }

  currentState = state;

  if (state.authStatus === "authenticated") {
    appElement.innerHTML = `
      <section class="card">
        <span class="badge">Popup</span>
        <h1 class="title">VietCalenAI</h1>
        <p class="text">You are logged in!</p>
        <p class="note">${getUserLabel(state.user)}</p>
        <p class="note">${getCalendarStatusText(state.calendar)}</p>
        ${
          errorMessage
            ? `<p class="message message-error">${errorMessage}</p>`
            : ""
        }
        <div class="actions">
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
  render(response?.sessionState ?? defaultSessionState);
}

async function handleAuthAction(action) {
  pendingAction = action;
  errorMessage = null;
  render(currentState);

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

    render(response.sessionState ?? currentState);
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
