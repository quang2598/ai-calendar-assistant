import { SESSION_STORAGE_KEY, defaultSessionState } from "../shared/session.js";

const appElement = document.querySelector("[data-request-microphone-app]");
let currentState = defaultSessionState;
let pendingAction = null;
let message = "Turn on microphone access first, then run a transcript test.";
let messageTone = "info";

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function readSessionState() {
  const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  currentState = stored[SESSION_STORAGE_KEY] ?? defaultSessionState;
}

async function updateMicrophoneState(status) {
  const nextState = {
    ...currentState,
    permissions: {
      ...currentState.permissions,
      microphone: status,
    },
  };

  currentState = nextState;
  await chrome.storage.local.set({
    [SESSION_STORAGE_KEY]: nextState,
  });
}

async function syncMicrophonePermissionFromBrowser() {
  if (!navigator.permissions?.query) {
    return;
  }

  try {
    const permissionStatus = await navigator.permissions.query({
      name: "microphone",
    });

    if (permissionStatus.state === "granted") {
      await updateMicrophoneState("granted");
    } else if (permissionStatus.state === "denied") {
      await updateMicrophoneState("denied");
    }
  } catch {
    // Ignore permission query failures and rely on explicit user actions.
  }
}

function render() {
  if (!appElement) {
    return;
  }

  const microphoneGranted = currentState.permissions?.microphone === "granted";
  const toneClass = messageTone === "error" ? "message message-error" : "note";

  appElement.innerHTML = `
    <section class="card">
      <span class="badge">Mic Setup</span>
      <h1 class="title">VietCalenAI</h1>
      <p class="text">Microphone Access</p>
      <p class="note">
        Turning on microphone access helps VietCalenAI support voice interactions better.
      </p>
      <p class="note">
        Current status: ${microphoneGranted ? "enabled" : "not enabled yet"}.
      </p>
      <p class="${toneClass}">${message}</p>
      <div class="actions">
        <button class="button" data-action="enable-microphone" ${pendingAction ? "disabled" : ""}>
          ${pendingAction === "enable-microphone" ? "Enabling..." : "Enable Microphone"}
        </button>
        <button class="button button-secondary" data-action="test-transcript" ${
          pendingAction || !microphoneGranted ? "disabled" : ""
        }>
          ${pendingAction === "test-transcript" ? "Listening..." : "Run Transcript Test"}
        </button>
      </div>
    </section>
  `;
}

async function requestMicrophoneAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this Chrome context.");
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await updateMicrophoneState("granted");
    message = "Microphone access is enabled. You can now run the transcript test.";
    messageTone = "info";
  } catch (error) {
    console.error("VietCalenAI microphone access failed:", error);
    await updateMicrophoneState("denied");
    message =
      "Microphone access is not available yet. Check browser permissions and try again.";
    messageTone = "error";
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

async function runTranscriptTest() {
  const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionConstructor) {
    throw new Error("Speech transcription is not available in this Chrome environment.");
  }

  const transcript = await new Promise((resolve, reject) => {
    const recognition = new SpeechRecognitionConstructor();
    let resolved = false;

    const finish = (callback) => {
      if (resolved) {
        return;
      }

      resolved = true;
      callback();
    };

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
      finish(() => resolve(text || "(no speech detected)"));
    };

    recognition.onerror = () => {
      finish(() => reject(new Error("Transcript test did not complete.")));
    };

    recognition.onend = () => {
      finish(() => resolve("(no speech detected)"));
    };

    recognition.start();
  });

  console.log("VietCalenAI microphone transcript:", transcript);
  message = "Transcript logged to the console.";
  messageTone = "info";
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || pendingAction) {
    return;
  }

  const action = target.dataset.action;
  if (!action) {
    return;
  }

  pendingAction = action;
  render();

  const task =
    action === "enable-microphone" ? requestMicrophoneAccess() : runTranscriptTest();

  void task
    .catch((error) => {
      message =
        error instanceof Error ? error.message : "Microphone setup did not complete.";
      messageTone = "error";
    })
    .finally(() => {
      pendingAction = null;
      render();
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SESSION_STORAGE_KEY]) {
    return;
  }

  currentState = changes[SESSION_STORAGE_KEY].newValue ?? defaultSessionState;
  render();
});

void readSessionState()
  .then(() => syncMicrophonePermissionFromBrowser())
  .then(() => readSessionState())
  .then(() => render());
