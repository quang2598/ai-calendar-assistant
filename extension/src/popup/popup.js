import { config } from "../config.js";
import { signInWithGoogle, signOut, connectCalendar, isCalendarConnected, getAuthState } from "../shared/auth.js";
import { addConversationMessage } from "../shared/firestore.js";
import { sendChat } from "../shared/agent.js";
import { getCurrentPosition } from "../shared/geo.js";
import { sendMessage, onMessage } from "../shared/messages.js";
import { speakText, stopSpeaking } from "../shared/tts.js";

// ─── DOM Elements ───
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const btnSignIn = document.getElementById("btn-sign-in");
const btnSignOut = document.getElementById("btn-sign-out");
const btnSidePanel = document.getElementById("btn-side-panel");
const btnConnectCalendar = document.getElementById("btn-connect-calendar");
const calendarBtnText = document.getElementById("calendar-btn-text");
const chatArea = document.getElementById("chat-area");
const siriOrb = document.getElementById("siri-orb");
const orbLabel = document.getElementById("orb-label");
const msgUser = document.getElementById("msg-user");
const msgUserText = document.getElementById("msg-user-text");
const msgSystem = document.getElementById("msg-system");
const msgSystemText = document.getElementById("msg-system-text");
const msgThinking = document.getElementById("msg-thinking");
const composerInput = document.getElementById("composer-input");
const btnMic = document.getElementById("btn-mic");
const btnSend = document.getElementById("btn-send");

// ─── State ───
let firebaseUid = null;
let conversationId = null;
let isListening = false;
let usedVoiceInput = false;

// ─── Init ───
(async function init() {
  const stored = await getAuthState();
  if (stored.authToken && stored.userInfo) {
    firebaseUid = stored.firebaseUid;
    showChatScreen();
    updateCalendarButton();
  }

  // Check if opened via wake word
  const { wakeWordTriggered } = await chrome.storage.local.get(["wakeWordTriggered"]);
  if (wakeWordTriggered) {
    await chrome.storage.local.remove(["wakeWordTriggered"]);
    if (stored.authToken) {
      startVoiceInput();
    }
  }
})();

// ─── Auth ───
btnSignIn.addEventListener("click", async () => {
  btnSignIn.disabled = true;
  btnSignIn.textContent = "Signing in...";
  try {
    const auth = await signInWithGoogle();
    firebaseUid = auth.firebaseUid;
    showChatScreen();
    updateCalendarButton();
  } catch (err) {
    console.error("Sign-in failed:", err);
    btnSignIn.disabled = false;
    btnSignIn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google`;
  }
});

btnSignOut.addEventListener("click", async () => {
  await signOut();
  firebaseUid = null;
  conversationId = null;
  showAuthScreen();
});

// ─── Side Panel ───
btnSidePanel.addEventListener("click", () => {
  sendMessage({ action: "openSidePanel" });
  window.close();
});

// ─── Calendar Connect ───
btnConnectCalendar.addEventListener("click", async () => {
  btnConnectCalendar.disabled = true;
  calendarBtnText.textContent = "Connecting...";
  try {
    await connectCalendar();
    updateCalendarButton();
  } catch (err) {
    console.error("Calendar connect failed:", err);
    calendarBtnText.textContent = "Connect Google Calendar";
    btnConnectCalendar.disabled = false;
  }
});

async function updateCalendarButton() {
  const connected = await isCalendarConnected();
  if (connected) {
    calendarBtnText.textContent = "Calendar Connected ✓";
    btnConnectCalendar.classList.add("border-green-400/30", "text-green-400");
    btnConnectCalendar.classList.remove("border-cyan-500/20", "text-cyan-400");
    btnConnectCalendar.disabled = false; // Still clickable to reconnect
  } else {
    calendarBtnText.textContent = "Reconnect Google Calendar";
    btnConnectCalendar.classList.add("border-amber-400/30", "text-amber-400");
    btnConnectCalendar.classList.remove("border-cyan-500/20", "text-cyan-400", "border-green-400/30", "text-green-400");
    btnConnectCalendar.disabled = false;
  }
}

// ─── Chat ───
btnSend.addEventListener("click", handleSend);

composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

composerInput.addEventListener("input", () => {
  composerInput.style.height = "auto";
  composerInput.style.height = Math.min(composerInput.scrollHeight, 80) + "px";
});

async function handleSend() {
  const text = composerInput.value.trim();
  if (!text || !firebaseUid) return;

  const wasVoice = usedVoiceInput;
  usedVoiceInput = false;

  // Stop any playing TTS
  stopSpeaking();

  composerInput.value = "";
  composerInput.style.height = "auto";

  // Generate conversationId if needed
  if (!conversationId) {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    conversationId = `ext-${ts}`;
  }

  // Show user message + thinking
  showUserMessage(text);
  showThinking();
  hideSystemMessage();

  // Save user message to Firestore
  addConversationMessage(firebaseUid, "user", text).catch(console.error);

  // Append geolocation to message for agent context (best-effort)
  let messageToAgent = text;
  try {
    const pos = await getCurrentPosition();
    if (pos) {
      messageToAgent = `${text}\n[user_location: lat=${pos.lat}, lng=${pos.lng}]`;
    }
  } catch {}

  try {
    const result = await sendChat(firebaseUid, conversationId, messageToAgent);
    conversationId = result.conversationId;

    hideThinking();

    // Save system response to Firestore
    addConversationMessage(firebaseUid, "system", result.text).catch(console.error);

    // Show typing effect and speak simultaneously if voice was used
    if (wasVoice) {
      speakText(result.text);
    }
    await typeMessage(result.text);

    // Tell side panel to refresh calendar events immediately
    sendMessage({ action: "refreshCalendarEvents" });
  } catch (err) {
    hideThinking();
    showSystemMessage(`Error: ${err.message}`);
  }
}

// ─── Typing Effect ───

async function typeMessage(text) {
  msgSystem.classList.remove("hidden");
  msgSystemText.textContent = "";
  msgSystemText.classList.add("typing-cursor");

  for (let i = 0; i < text.length; i++) {
    msgSystemText.textContent += text[i];
    // Variable speed: faster for spaces, slower for punctuation
    const char = text[i];
    const delay = char === " " ? 10 : ".!?,;:".includes(char) ? 80 : 20;
    await sleep(delay);
  }

  msgSystemText.classList.remove("typing-cursor");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Voice Input (direct in popup) ───
let recognition = null;
let silenceTimer = null;
let hasSpoken = false;

btnMic.addEventListener("click", toggleVoice);

function toggleVoice() {
  if (isListening) {
    stopVoiceInput();
    usedVoiceInput = true;
    handleSend();
  } else {
    startVoiceInput();
  }
}

async function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showSystemMessage("Speech recognition not supported.");
    return;
  }

  // Check mic permission — if not granted, open permission page
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Open mic permission page in a new tab
    sendMessage({ action: "openMicPermission" });
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isListening = true;
    hasSpoken = false;
    showOrb("Listening...");
    btnMic.classList.add("text-cyan-400");
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
    if (finalTranscript) {
      const current = composerInput.value;
      const sep = current && !current.endsWith(" ") ? " " : "";
      composerInput.value = current + sep + finalTranscript;
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    stopVoiceInput();
  };

  recognition.onend = () => {
    if (isListening) {
      try { recognition.start(); } catch { stopVoiceInput(); }
    }
  };

  try {
    recognition.start();
  } catch {
    showSystemMessage("Failed to start speech recognition.");
  }
}

function stopVoiceInput() {
  isListening = false;
  clearSilenceTimer();
  hideOrb();
  btnMic.classList.remove("text-cyan-400");
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
      stopVoiceInput();
      usedVoiceInput = true;
      setTimeout(() => handleSend(), 100);
    }
  }, config.silenceTimeoutMs);
}

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
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

function showUserMessage(text) {
  msgUser.classList.remove("hidden");
  msgUserText.textContent = text;
}

function showSystemMessage(text) {
  msgSystem.classList.remove("hidden");
  msgSystemText.textContent = text;
  msgSystemText.classList.remove("typing-cursor");
}

function hideSystemMessage() {
  msgSystem.classList.add("hidden");
  msgSystemText.textContent = "";
}

function showThinking() {
  msgThinking.classList.remove("hidden");
}

function hideThinking() {
  msgThinking.classList.add("hidden");
}

function showOrb(label) {
  siriOrb.classList.remove("hidden");
  msgUser.classList.add("hidden");
  msgSystem.classList.add("hidden");
  msgThinking.classList.add("hidden");
  orbLabel.textContent = label;

  // Set orb to listening style
  const orbEl = siriOrb.querySelector("div");
  orbEl.classList.add("orb-listening");
  orbEl.classList.remove("orb-thinking");
}

function hideOrb() {
  siriOrb.classList.add("hidden");
}

// ─── Listen for auth changes (merged into voice listener above) ───
onMessage((message) => {
  if (message.action === "authChanged") {
    getAuthState().then((stored) => {
      if (stored.authToken) {
        firebaseUid = stored.firebaseUid;
        showChatScreen();
        updateCalendarButton();
      } else {
        showAuthScreen();
      }
    });
  }
});
