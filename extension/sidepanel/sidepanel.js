import { SESSION_STORAGE_KEY, defaultSessionState } from "../shared/session.js";

const appElement = document.querySelector("[data-sidepanel-app]");

function getUserLabel(user) {
  if (!user) {
    return "Authenticated session active.";
  }

  return user.displayName || user.email || "Authenticated session active.";
}

function render(state = defaultSessionState) {
  if (!appElement) {
    return;
  }

  if (state.authStatus === "authenticated") {
    appElement.innerHTML = `
      <section class="card">
        <span class="badge">Side Panel</span>
        <h1 class="title">VietCalenAI</h1>
        <p class="text">You are logged in!</p>
        <p class="note">${getUserLabel(state.user)}</p>
      </section>
    `;
    return;
  }

  appElement.innerHTML = `
    <section class="card">
      <span class="badge">Side Panel</span>
      <h1 class="title">VietCalenAI</h1>
      <p class="text">Please sign in from the popup.</p>
      <p class="note">
        Calendar and action history will appear here after authentication is
        implemented.
      </p>
    </section>
  `;
}

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
  render(response?.sessionState ?? defaultSessionState);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SESSION_STORAGE_KEY]) {
    return;
  }

  render(changes[SESSION_STORAGE_KEY].newValue ?? defaultSessionState);
});

void loadState();
