// ─── Config ───
const FIREBASE_PROJECT_ID = "ai-calendar-assistant-group";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_API_KEY = "AIzaSyCsctcOVlSKYeuYD9RICBdZnntNdJHjnqI";
const AGENT_URL = "http://localhost:8000";
const AGENT_CHAT_URL = `${AGENT_URL}/agent/send-chat`;
const TTS_URL = "http://localhost:3000/api/speech/synthesize";
const SILENCE_TIMEOUT_MS = 1200;

// ─── DOM ───
const authScreen = document.getElementById("auth-screen");
const mainScreen = document.getElementById("main-screen");
const btnSignIn = document.getElementById("btn-sign-in");
const tabs = document.querySelectorAll(".tab");
const tabEvents = document.getElementById("tab-events");
const tabHistory = document.getElementById("tab-history");
const calendarDays = document.getElementById("calendar-days");
const calendarMonthLabel = document.getElementById("calendar-month-label");
const btnPrevMonth = document.getElementById("btn-prev-month");
const btnNextMonth = document.getElementById("btn-next-month");
const eventsDateLabel = document.getElementById("events-date-label");
const eventsList = document.getElementById("events-list");
const historyList = document.getElementById("history-list");

// ─── State ───
let authToken = null;
let firebaseIdToken = null;
let firebaseUid = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedDate = new Date();
let events = [];

// ─── Init ───
(async function init() {
  const stored = await chrome.storage.local.get(["authToken", "userInfo", "firebaseUid"]);
  if (stored.authToken) {
    authToken = stored.authToken;
    firebaseUid = stored.firebaseUid || null;
    showMainScreen();
    renderCalendar();
    loadEvents();
    // Get Firebase ID token for Firestore access, then load history
    await ensureFirebaseAuth();
    loadHistory();
  }

  // Listen for auth changes from popup
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.authToken) {
      if (changes.authToken.newValue) {
        authToken = changes.authToken.newValue;
        showMainScreen();
        renderCalendar();
        loadEvents();
        await ensureFirebaseAuth();
        loadHistory();
      } else {
        authToken = null;
        firebaseIdToken = null;
        firebaseUid = null;
        showAuthScreen();
      }
    }
  });
})();

// ─── Firebase Auth ───
async function ensureFirebaseAuth() {
  if (!authToken) return;

  try {
    const response = await fetch(
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
    const data = await response.json();
    if (data.idToken) {
      firebaseIdToken = data.idToken;
      firebaseUid = data.localId;
      await chrome.storage.local.set({ firebaseUid });
    } else {
      console.error("Firebase auth failed:", data);
    }
  } catch (err) {
    console.error("Firebase auth error:", err);
  }
}

// ─── Auth ───
btnSignIn.addEventListener("click", async () => {
  btnSignIn.disabled = true;
  btnSignIn.textContent = "Signing in...";

  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (tok) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(tok);
        }
      });
    });

    authToken = token;

    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const userInfo = await userResponse.json();

    await chrome.storage.local.set({ authToken, userInfo });
    showMainScreen();
    renderCalendar();
    loadEvents();
    await ensureFirebaseAuth();
    loadHistory();
  } catch (err) {
    console.error("Sign-in failed:", err);
    btnSignIn.disabled = false;
    btnSignIn.textContent = "Sign in with Google";
  }
});

// ─── Tabs ───
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const target = tab.dataset.tab;
    tabEvents.classList.toggle("active", target === "events");
    tabHistory.classList.toggle("active", target === "history");

    // Refresh data when switching to a tab
    if (target === "history") loadHistory();
    if (target === "events") loadEvents();
  });
});

// ─── Calendar ───
btnPrevMonth.addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
  loadEvents();
});

btnNextMonth.addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  renderCalendar();
  loadEvents();
});

function renderCalendar() {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  calendarMonthLabel.textContent = `${months[currentMonth]} ${currentYear}`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const today = new Date();
  calendarDays.innerHTML = "";

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const btn = createDayButton(day, true);
    calendarDays.appendChild(btn);
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear();

    const isSelected =
      day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear();

    const btn = createDayButton(day, false, isToday, isSelected);
    btn.addEventListener("click", () => {
      selectedDate = new Date(currentYear, currentMonth, day);
      renderCalendar();
      loadEvents();
    });
    calendarDays.appendChild(btn);
  }

  // Next month days
  const totalCells = calendarDays.children.length;
  const remaining = 42 - totalCells;
  for (let day = 1; day <= remaining; day++) {
    const btn = createDayButton(day, true);
    calendarDays.appendChild(btn);
  }
}

function createDayButton(day, isOtherMonth, isToday = false, isSelected = false) {
  const btn = document.createElement("button");
  btn.className = "cal-day";
  btn.textContent = day;
  if (isOtherMonth) btn.classList.add("other-month");
  if (isToday) btn.classList.add("today");
  if (isSelected) btn.classList.add("selected");
  return btn;
}

// ─── Events ───
async function loadEvents() {
  if (!authToken) return;

  try {
    const start = new Date(currentYear, currentMonth, 1);
    const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    const timeMin = start.toISOString();
    const timeMax = end.toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok) {
      const data = await response.json();
      events = data.items || [];
      renderEventsForDate(selectedDate);
    } else {
      console.error("Calendar API error:", response.status);
      if (response.status === 403 || response.status === 401) {
        const newToken = await new Promise((resolve) => {
          chrome.identity.getAuthToken({ interactive: true }, resolve);
        });
        if (newToken && newToken !== authToken) {
          authToken = newToken;
          await chrome.storage.local.set({ authToken });
          loadEvents();
        }
      }
    }
  } catch (err) {
    console.error("Failed to load events:", err);
  }
}

function renderEventsForDate(date) {
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  eventsDateLabel.textContent = isToday ? "Today's Events" : `Events - ${dateStr}`;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const dayEvents = events.filter((event) => {
    const start = new Date(event.start?.dateTime || event.start?.date || event.start);
    return start >= dayStart && start <= dayEnd;
  });

  if (dayEvents.length === 0) {
    eventsList.innerHTML = '<div class="empty-state">No events for this day</div>';
    return;
  }

  eventsList.innerHTML = "";
  dayEvents.forEach((event) => {
    const startTime = event.start?.dateTime
      ? new Date(event.start.dateTime).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "All day";

    const endTime = event.end?.dateTime
      ? new Date(event.end.dateTime).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

    const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;

    const item = document.createElement("div");
    item.className = "event-item";
    item.innerHTML = `
      <div class="event-time-bar"></div>
      <div class="event-details">
        <div class="event-title">${escapeHtml(event.summary || "Untitled Event")}</div>
        <div class="event-time">${timeStr}</div>
      </div>
    `;
    eventsList.appendChild(item);
  });
}

// ─── History (Firestore REST API) ───
const historyListView = document.getElementById("history-list-view");
const historyMessagesView = document.getElementById("history-messages-view");
const btnBackHistory = document.getElementById("btn-back-history");
const messagesConvTitle = document.getElementById("messages-conv-title");
const messagesList = document.getElementById("messages-list");

// Conversation composer DOM
const convInput = document.getElementById("conv-input");
const btnConvSend = document.getElementById("btn-conv-send");
const btnConvMic = document.getElementById("btn-conv-mic");
const convVoiceOverlay = document.getElementById("conv-voice-overlay");
const convVoiceBars = document.getElementById("conv-voice-bars");
const btnConvVoiceStop = document.getElementById("btn-conv-voice-stop");

let currentConversationId = null;
let convRecognition = null;
let convIsListening = false;
let convSilenceTimer = null;
let convHasSpoken = false;
let convUsedVoice = false;
let convTtsAbort = null;

// Create voice bars
for (let i = 0; i < 16; i++) {
  const bar = document.createElement("div");
  bar.className = "conv-voice-bar";
  convVoiceBars.appendChild(bar);
}

btnBackHistory.addEventListener("click", () => {
  stopConvMic();
  currentConversationId = null;
  historyMessagesView.classList.add("hidden");
  historyListView.classList.remove("hidden");
});

async function loadHistory() {
  if (!firebaseIdToken || !firebaseUid) {
    historyList.innerHTML = '<div class="empty-state">No conversations yet</div>';
    return;
  }

  try {
    const url = `${FIRESTORE_BASE}/users/${firebaseUid}/conversations?orderBy=lastUpdated%20desc&pageSize=20`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${firebaseIdToken}` },
    });

    if (!response.ok) {
      console.error("Firestore error:", response.status, await response.text());
      historyList.innerHTML = '<div class="empty-state">No conversations yet</div>';
      return;
    }

    const data = await response.json();
    const documents = data.documents || [];

    if (documents.length === 0) {
      historyList.innerHTML = '<div class="empty-state">No conversations yet</div>';
      return;
    }

    historyList.innerHTML = "";
    documents.forEach((doc) => {
      const fields = doc.fields || {};
      const title = fields.title?.stringValue || "Untitled chat";
      const lastUpdated = fields.lastUpdated?.timestampValue || fields.createdAt?.timestampValue;
      const lastUpdatedMs = lastUpdated ? new Date(lastUpdated).getTime() : 0;

      // Extract conversation ID from document path
      const pathParts = doc.name.split("/");
      const conversationId = pathParts[pathParts.length - 1];

      const item = document.createElement("button");
      item.className = "history-item";
      item.innerHTML = `
        <div class="history-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div class="history-details">
          <div class="history-title">${escapeHtml(title)}</div>
          <div class="history-date">${formatDate(lastUpdatedMs)}</div>
        </div>
      `;
      item.addEventListener("click", () => openConversation(conversationId, title));
      historyList.appendChild(item);
    });
  } catch (err) {
    console.error("Failed to load history:", err);
    historyList.innerHTML = '<div class="empty-state">Failed to load history</div>';
  }
}

async function openConversation(conversationId, title) {
  currentConversationId = conversationId;
  convInput.value = "";

  // Switch to messages view
  historyListView.classList.add("hidden");
  historyMessagesView.classList.remove("hidden");
  messagesConvTitle.textContent = title;
  messagesList.innerHTML = '<div class="empty-state">Loading messages...</div>';

  try {
    const url = `${FIRESTORE_BASE}/users/${firebaseUid}/conversations/${conversationId}/messages?orderBy=createdAt%20asc&pageSize=100`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${firebaseIdToken}` },
    });

    if (!response.ok) {
      console.error("Messages error:", response.status);
      messagesList.innerHTML = '<div class="empty-state">Failed to load messages</div>';
      return;
    }

    const data = await response.json();
    const documents = data.documents || [];

    if (documents.length === 0) {
      messagesList.innerHTML = '<div class="empty-state">No messages in this conversation</div>';
      return;
    }

    messagesList.innerHTML = "";
    documents.forEach((doc) => {
      const fields = doc.fields || {};
      const role = fields.role?.stringValue || "system";
      const text = fields.text?.stringValue || "";
      const createdAt = fields.createdAt?.timestampValue;
      const timeStr = createdAt
        ? new Date(createdAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : "";

      const bubble = document.createElement("div");
      bubble.className = `msg-bubble msg-${role}`;
      bubble.innerHTML = `
        <div class="msg-text">${escapeHtml(text)}</div>
        ${timeStr ? `<div class="msg-time">${timeStr}</div>` : ""}
      `;
      messagesList.appendChild(bubble);
    });

    // Scroll to bottom
    messagesList.scrollTop = messagesList.scrollHeight;
  } catch (err) {
    console.error("Failed to load messages:", err);
    messagesList.innerHTML = '<div class="empty-state">Failed to load messages</div>';
  }
}

// ─── Conversation Chat ───
btnConvSend.addEventListener("click", sendConvMessage);

convInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendConvMessage();
  }
});

convInput.addEventListener("input", () => {
  convInput.style.height = "auto";
  convInput.style.height = Math.min(convInput.scrollHeight, 80) + "px";
});

async function sendConvMessage() {
  const text = convInput.value.trim();
  if (!text || !currentConversationId || !firebaseUid) return;

  // Show user message in UI
  appendConvMessage("user", text);
  convInput.value = "";
  convInput.style.height = "auto";

  // Show typing indicator
  const typingEl = document.createElement("div");
  typingEl.className = "msg-bubble msg-system";
  typingEl.innerHTML = '<div class="msg-text typing-dots"><span>.</span><span>.</span><span>.</span></div>';
  messagesList.appendChild(typingEl);
  messagesList.scrollTop = messagesList.scrollHeight;

  try {
    const response = await fetch(AGENT_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: firebaseUid,
        conversationId: currentConversationId,
        message: text,
      }),
    });

    typingEl.remove();

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail?.message || `Server error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.responseMessage?.text || data.response || data.message || "No response";
    appendConvMessage("system", reply);

    // Speak the reply if user used voice input
    if (convUsedVoice) {
      convUsedVoice = false;
      speakConvText(reply);
    }
  } catch (err) {
    typingEl.remove();
    appendConvMessage("system", `Error: ${err.message}`);
  }
}

function appendConvMessage(role, text) {
  const now = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const bubble = document.createElement("div");
  bubble.className = `msg-bubble msg-${role}`;
  bubble.innerHTML = `
    <div class="msg-text">${escapeHtml(text)}</div>
    <div class="msg-time">${now}</div>
  `;
  messagesList.appendChild(bubble);
  messagesList.scrollTop = messagesList.scrollHeight;
}

// ─── Conversation Voice Input ───
btnConvMic.addEventListener("click", toggleConvMic);
btnConvVoiceStop.addEventListener("click", () => {
  stopConvMic();
  setTimeout(() => sendConvMessage(), 150);
});

function toggleConvMic() {
  if (convIsListening) {
    stopConvMic();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
      startConvMic();
    })
    .catch(() => {
      appendConvMessage("system", "Microphone access denied.");
    });
}

function startConvMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  convRecognition = new SpeechRecognition();
  convRecognition.continuous = true;
  convRecognition.interimResults = true;
  convRecognition.lang = "en-US";

  convRecognition.onstart = () => {
    convIsListening = true;
    convHasSpoken = false;
    convUsedVoice = true;
    btnConvMic.classList.add("listening");
    convVoiceOverlay.classList.remove("hidden");
  };

  convRecognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    convHasSpoken = true;
    resetConvSilenceTimer();
    animateConvBars();

    if (finalTranscript) {
      const current = convInput.value;
      const sep = current && !current.endsWith(" ") ? " " : "";
      convInput.value = current + sep + finalTranscript;
    }
  };

  convRecognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    stopConvMic();
  };

  convRecognition.onend = () => {
    if (convIsListening) {
      try { convRecognition.start(); } catch { stopConvMic(); }
    }
  };

  try {
    convRecognition.start();
  } catch {
    appendConvMessage("system", "Failed to start speech recognition.");
  }
}

function stopConvMic() {
  convIsListening = false;
  clearConvSilenceTimer();
  btnConvMic.classList.remove("listening");
  convVoiceOverlay.classList.add("hidden");

  if (convRecognition) {
    convRecognition.onend = null;
    convRecognition.abort();
    convRecognition = null;
  }
}

function resetConvSilenceTimer() {
  clearConvSilenceTimer();
  convSilenceTimer = setTimeout(() => {
    if (convHasSpoken && convIsListening) {
      stopConvMic();
      setTimeout(() => sendConvMessage(), 150);
    }
  }, SILENCE_TIMEOUT_MS);
}

function clearConvSilenceTimer() {
  if (convSilenceTimer) {
    clearTimeout(convSilenceTimer);
    convSilenceTimer = null;
  }
}

function animateConvBars() {
  const bars = convVoiceBars.querySelectorAll(".conv-voice-bar");
  bars.forEach((bar) => {
    bar.style.height = Math.random() * 20 + 4 + "px";
  });
  setTimeout(() => {
    if (!convIsListening) return;
    bars.forEach((bar) => { bar.style.height = "4px"; });
  }, 200);
}

// ─── TTS ───
function speakConvText(text) {
  stopConvTts();

  const controller = new AbortController();
  convTtsAbort = controller;

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
      if (convTtsAbort !== controller) return;
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      chrome.runtime.sendMessage({ action: "playTTS", audioBase64: base64 });
    })
    .catch((err) => {
      if (err.name === "AbortError") return;
      console.error("TTS error:", err);
    });
}

function stopConvTts() {
  if (convTtsAbort) {
    convTtsAbort.abort();
    convTtsAbort = null;
  }
  chrome.runtime.sendMessage({ action: "stopTTS" });
}

// ─── Helpers ───
function showAuthScreen() {
  authScreen.classList.remove("hidden");
  mainScreen.classList.add("hidden");
}

function showMainScreen() {
  authScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(ms) {
  if (!ms) return "";
  const date = new Date(ms);
  const now = new Date();
  const diff = now - date;

  if (diff < 86400000) return "Today";
  if (diff < 172800000) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
