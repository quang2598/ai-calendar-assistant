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
    // If we have a token but no Firebase UID yet (service worker signed in while popup was closed),
    // sign into Firebase now
    if (!stored.firebaseUid) {
      try {
        const { signIntoFirebase } = await import("../shared/firebase.js");
        const uid = await signIntoFirebase(stored.authToken);
        await chrome.storage.local.set({ firebaseUid: uid });
        firebaseUid = uid;
      } catch (err) {
        console.warn("Firebase sign-in failed:", err);
      }
    } else {
      firebaseUid = stored.firebaseUid;
    }
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
btnSignIn.addEventListener("click", () => {
  btnSignIn.disabled = true;
  btnSignIn.textContent = "Signing in...";
  // Delegate to service worker — popup will close when consent window opens,
  // and init() will pick up the stored auth when popup reopens.
  sendMessage({
    action: "signInWithGoogle",
    webOauthClientId: config.webOauthClientId,
    webOauthClientSecret: config.webOauthClientSecret,
  });
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
btnConnectCalendar.addEventListener("click", () => {
  btnConnectCalendar.disabled = true;
  calendarBtnText.textContent = "Connecting...";
  // Delegate to service worker — popup may close when consent window opens
  sendMessage({
    action: "connectCalendar",
    webOauthClientId: config.webOauthClientId,
    backendUrl: config.backendUrl,
  });
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

  // conversationId starts as null — backend creates it on first message

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

// ─── Listen for auth/calendar changes via storage ───
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  // Auth token changed — sign into Firebase + show chat
  if (changes.authToken && changes.authToken.newValue) {
    getAuthState().then(async (stored) => {
      if (stored.authToken && stored.userInfo) {
        if (!stored.firebaseUid) {
          try {
            const { signIntoFirebase } = await import("../shared/firebase.js");
            const uid = await signIntoFirebase(stored.authToken);
            await chrome.storage.local.set({ firebaseUid: uid });
            firebaseUid = uid;
          } catch (err) {
            console.warn("Firebase sign-in failed:", err);
          }
        } else {
          firebaseUid = stored.firebaseUid;
        }
        showChatScreen();
        updateCalendarButton();
      }
    });
  } else if (changes.authToken && !changes.authToken.newValue) {
    showAuthScreen();
  }

  // Calendar connected — update UI
  if (changes.calendarConnected && changes.calendarConnected.newValue) {
    updateCalendarButton();
  }
});

// Also listen for message-based auth changes (from other extension pages)
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
