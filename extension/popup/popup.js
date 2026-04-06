import { SESSION_STORAGE_KEY, defaultSessionState } from "../shared/session.js";

const appElement = document.querySelector("[data-popup-app]");
let currentState = defaultSessionState;
let isPending = false;
let errorMessage = null;

function getUserLabel(user) {
  if (!user) {
    return "Not logged in.";
  }

  return user.displayName || user.email || "You are logged in!";
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
        ${
          errorMessage
            ? `<p class="message message-error">${errorMessage}</p>`
            : ""
        }
        <div class="actions">
          <button class="button button-secondary" data-action="sign-out" ${
            isPending ? "disabled" : ""
          }>
            ${isPending ? "Working..." : "Sign out"}
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
        <button class="button" data-action="sign-in" ${isPending ? "disabled" : ""}>
          ${isPending ? "Opening Google..." : "Continue with Google"}
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
  isPending = true;
  errorMessage = null;
  render(currentState);

  const messageType =
    action === "sign-out" ? "AUTH_SIGN_OUT" : "AUTH_SIGN_IN_WITH_GOOGLE";

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
    isPending = false;
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
  if (!action || isPending) {
    return;
  }

  void handleAuthAction(action);
});

void loadState();
