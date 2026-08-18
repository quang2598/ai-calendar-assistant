// ─── Config ───
const API_BASE = "http://localhost:3000";
const AGENT_URL = "http://localhost:8000";
const AGENT_CHAT_URL = `${AGENT_URL}/agent/send-chat`;
const TTS_URL = `${API_BASE}/api/speech/synthesize`;
const SILENCE_TIMEOUT_MS = 1200;
const FIREBASE_API_KEY = "";

// ─── DOM Elements ───
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const btnSignIn = document.getElementById("btn-sign-in");
const btnSignOut = document.getElementById("btn-sign-out");
const btnSidePanel = document.getElementById("btn-side-panel");
const btnConnectCalendar = document.getElementById("btn-connect-calendar");
const calendarBanner = document.getElementById("calendar-banner");
const speakingIndicator = document.getElementById("speaking-indicator");
const messagesContainer = document.getElementById("messages");
const composerInput = document.getElementById("composer-input");
const btnMic = document.getElementById("btn-mic");
const btnSend = document.getElementById("btn-send");
const voiceOverlay = document.getElementById("voice-overlay");
const voiceBars = document.getElementById("voice-bars");
const btnStopMic = document.getElementById("btn-stop-mic");

// ─── State ───
let authToken = null;
let userInfo = null;
let firebaseUid = null;
let conversationId = null;
let isListening = false;
let recognition = null;
let silenceTimer = null;
let hasSpoken = false;
let usedVoiceInput = false;
let currentAudio = null;
let currentAbort = null;

// ─── Init ───
(async function init() {
  // Create voice bars
  for (let i = 0; i < 24; i++) {
    const bar = document.createElement("div");
    bar.className = "voice-bar";
    bar.style.height = "4px";
    voiceBars.appendChild(bar);
  }

  // Check stored auth
  const stored = await chrome.storage.local.get(["authToken", "userInfo", "firebaseUid", "conversationId", "calendarConnected"]);
  if (stored.authToken && stored.userInfo) {
    authToken = stored.authToken;
    userInfo = stored.userInfo;
    firebaseUid = stored.firebaseUid;
    conversationId = stored.conversationId || null;
    showChatScreen();
    if (stored.calendarConnected) {
      calendarBanner.classList.add("hidden");
    }
    if (conversationId) {
      loadMessages();
    }
  }
})();

// ─── Auth ───
btnSignIn.addEventListener("click", async () => {
  btnSignIn.disabled = true;
  btnSignIn.textContent = "Signing in...";

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAuthToken" }, resolve);
    });

    if (response.error) {
      throw new Error(response.error);
    }

    authToken = response.token;

    // Get user info from Google
    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    userInfo = await userResponse.json();

    // Sign into Firebase with the Google OAuth token to get Firebase UID
    try {
      const firebaseResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postBody: `access_token=${authToken}&providerId=google.com`,
            requestUri: "http://localhost",
            returnIdpCredential: true,
            returnSecureToken: true,
          }),
        }
      );
      const firebaseData = await firebaseResponse.json();
      if (firebaseData.localId) {
        firebaseUid = firebaseData.localId;
      } else {
        console.warn("Firebase sign-in: no localId", firebaseData);
      }
    } catch (err) {
      console.warn("Firebase sign-in failed, continuing without:", err);
    }

    await chrome.storage.local.set({ authToken, userInfo, firebaseUid });
    showChatScreen();
  } catch (err) {
    showError(authScreen, err.message);
    btnSignIn.disabled = false;
    btnSignIn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" class="google-icon"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google`;
  }
});

btnSignOut.addEventListener("click", async () => {
  if (authToken) {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "removeCachedAuthToken", token: authToken },
        resolve
      );
    });
  }
  authToken = null;
  userInfo = null;
  firebaseUid = null;
  conversationId = null;
  await chrome.storage.local.remove(["authToken", "userInfo", "firebaseUid", "conversationId", "calendarConnected"]);
  showAuthScreen();
});

// ─── Side Panel ───
btnSidePanel.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  window.close(); // Close the popup
});

// ─── Calendar ───
btnConnectCalendar.addEventListener("click", async () => {
  btnConnectCalendar.disabled = true;
  btnConnectCalendar.textContent = "Connecting...";

  try {
    // Test calendar access with the existing auth token
    console.log("Testing calendar with token:", authToken?.substring(0, 20) + "...");
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary",
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Calendar API error:", response.status, errBody);
      throw new Error("Could not access Google Calendar");
    }

    // Calendar connected — hide banner
    calendarBanner.classList.add("hidden");
    await chrome.storage.local.set({ calendarConnected: true });
    appendMessage("system", "Google Calendar connected successfully!");
  } catch (err) {
    showError(chatScreen, err.message);
    btnConnectCalendar.disabled = false;
    btnConnectCalendar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Connect Google Calendar`;
  }
});

// ─── Messaging ───
btnSend.addEventListener("click", sendMessage);

composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

composerInput.addEventListener("input", () => {
  // Auto-resize textarea
  composerInput.style.height = "auto";
  composerInput.style.height = Math.min(composerInput.scrollHeight, 80) + "px";
});

async function sendMessage() {
  const text = composerInput.value.trim();
  if (!text) return;

  // Show user message
  appendMessage("user", text);
  composerInput.value = "";
  composerInput.style.height = "auto";

  // Show typing
  const typingEl = showTypingIndicator();

  try {
    // Generate a conversationId if none exists
    if (!conversationId) {
      const now = new Date();
      const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 15);
      conversationId = `ext-${ts}`;
      await chrome.storage.local.set({ conversationId });
    }

    const response = await fetch(AGENT_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: firebaseUid || userInfo?.id || "extension-user",
        conversationId: conversationId,
        message: text,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail?.message || `Server error: ${response.status}`);
    }

    const data = await response.json();
    typingEl.remove();

    if (data.conversationId) {
      conversationId = data.conversationId;
      await chrome.storage.local.set({ conversationId });
    }

    const reply = data.responseMessage?.text || data.response || data.message || data.text || "No response";
    appendMessage("system", reply);

    // Only speak if voice input was used
    if (usedVoiceInput) {
      usedVoiceInput = false;
      speakText(reply);
    }
  } catch (err) {
    typingEl.remove();
    appendMessage("system", `Error: ${err.message}`);
  }
}

async function loadMessages() {
  // TODO: Load message history from Firestore via API
}

// ─── Voice Input ───
btnMic.addEventListener("click", toggleMic);
btnStopMic.addEventListener("click", stopMic);

async function toggleMic() {
  if (isListening) {
    stopMic();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showError(chatScreen, "Speech recognition not supported.");
    return;
  }

  // Request mic permission first
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream — we just needed permission
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    showError(chatScreen, "Microphone access denied.");
    return;
  }

  startMic();
}

function startMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isListening = true;
    hasSpoken = false;
    usedVoiceInput = true;
    btnMic.classList.add("listening");
    voiceOverlay.classList.remove("hidden");
  };

  recognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    hasSpoken = true;
    resetSilenceTimer();
    animateVoiceBars();

    if (finalTranscript) {
      const current = composerInput.value;
      const separator = current && !current.endsWith(" ") ? " " : "";
      composerInput.value = current + separator + finalTranscript;
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    stopMic();
  };

  recognition.onend = () => {
    if (isListening) {
      try { recognition.start(); } catch { stopMic(); }
    }
  };

  try {
    recognition.start();
  } catch {
    showError(chatScreen, "Failed to start speech recognition.");
  }
}

function stopMic() {
  isListening = false;
  clearSilenceTimer();
  btnMic.classList.remove("listening");
  voiceOverlay.classList.add("hidden");

  if (recognition) {
    recognition.onend = null;
    recognition.abort();
    recognition = null;
  }
}

function resetSilenceTimer() {
  clearSilenceTimer();
  silenceTimer = setTimeout(() => {
    if (hasSpoken && isListening) {
      stopMic();
      setTimeout(() => sendMessage(), 150);
    }
  }, SILENCE_TIMEOUT_MS);
}

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function animateVoiceBars() {
  const bars = voiceBars.querySelectorAll(".voice-bar");
  bars.forEach((bar) => {
    bar.style.height = Math.random() * 28 + 4 + "px";
  });
  setTimeout(() => {
    if (!isListening) return;
    bars.forEach((bar) => { bar.style.height = "4px"; });
  }, 200);
}

// ─── TTS ───
speakingIndicator.addEventListener("click", stopSpeaking);

// Listen for audio status from offscreen
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "audioEnded" || message.action === "audioError") {
    speakingIndicator.classList.add("hidden");
  }
});

function speakText(text) {
  stopSpeaking();

  const controller = new AbortController();
  currentAbort = controller;
  speakingIndicator.classList.remove("hidden");

  fetch(TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error("TTS failed");
      return res.arrayBuffer();
    })
    .then((buffer) => {
      if (currentAbort !== controller) return;
      // Convert to base64 and send to offscreen for playback
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      chrome.runtime.sendMessage({ action: "playTTS", audioBase64: base64 });
    })
    .catch((err) => {
      if (err.name === "AbortError") return;
      speakingIndicator.classList.add("hidden");
    });
}

function stopSpeaking() {
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  chrome.runtime.sendMessage({ action: "stopTTS" });
  speakingIndicator.classList.add("hidden");
}

// ─── UI Helpers ───
function showAuthScreen() {
  authScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}

function showChatScreen() {
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}

function appendMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `message message-${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Assistant";

  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = text;

  msg.appendChild(label);
  msg.appendChild(body);
  messagesContainer.appendChild(msg);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
  const msg = document.createElement("div");
  msg.className = "message message-system";

  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.innerHTML = "<span></span><span></span><span></span>";

  msg.appendChild(indicator);
  messagesContainer.appendChild(msg);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return msg;
}

function showError(parent, message) {
  // Remove existing error
  const existing = parent.querySelector(".error-text");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = "error-text";
  el.textContent = message;
  parent.appendChild(el);

  setTimeout(() => el.remove(), 5000);
}
