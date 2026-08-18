const SILENCE_TIMEOUT_MS = 1200;
const AGENT_URL = "http://localhost:8000";
const TTS_URL = "http://localhost:3000/api/speech/synthesize";

const voiceBars = document.getElementById("voice-bars");
const transcriptEl = document.getElementById("transcript");
const btnStop = document.getElementById("btn-stop");
const errorEl = document.getElementById("error");
const titleEl = document.querySelector(".title");
const hintEl = document.querySelector(".hint");

let recognition = null;
let silenceTimer = null;
let hasSpoken = false;
let fullTranscript = "";

// Create voice bars
for (let i = 0; i < 24; i++) {
  const bar = document.createElement("div");
  bar.className = "voice-bar";
  voiceBars.appendChild(bar);
}

// Start speech recognition immediately
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  errorEl.textContent = "Speech recognition not supported.";
} else {
  startListening();
}

btnStop.addEventListener("click", () => {
  stopAndSend();
});

function startListening() {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    if (final) {
      const separator = fullTranscript && !fullTranscript.endsWith(" ") ? " " : "";
      fullTranscript += separator + final;
    }

    transcriptEl.textContent = fullTranscript + (interim ? " " + interim : "");

    hasSpoken = true;
    animateBars();
    resetSilenceTimer();
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "not-allowed") {
      errorEl.textContent = "Microphone access denied.";
      return;
    }
    errorEl.textContent = `Error: ${event.error}`;
  };

  recognition.onend = () => {
    if (recognition) {
      try { recognition.start(); } catch { stopAndSend(); }
    }
  };

  try {
    recognition.start();
  } catch {
    errorEl.textContent = "Failed to start speech recognition.";
  }
}

function stopAndSend() {
  clearSilenceTimer();

  if (recognition) {
    recognition.onend = null;
    recognition.abort();
    recognition = null;
  }

  const text = fullTranscript.trim();
  if (text) {
    sendToAgent(text);
  } else {
    window.close();
  }
}

async function sendToAgent(text) {
  // Update UI to thinking state
  titleEl.textContent = "Thinking...";
  btnStop.style.display = "none";
  voiceBars.style.display = "none";
  hintEl.textContent = "";
  transcriptEl.textContent = `You: "${text}"`;

  try {
    const stored = await chrome.storage.local.get(["firebaseUid", "userInfo", "conversationId"]);
    const uid = stored.firebaseUid || stored.userInfo?.id || "extension-user";
    let conversationId = stored.conversationId;

    if (!conversationId) {
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      conversationId = `ext-${ts}`;
      await chrome.storage.local.set({ conversationId });
    }

    const response = await fetch(`${AGENT_URL}/agent/send-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, conversationId, message: text }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();
    const reply = data.responseMessage?.text || data.response || "No response";

    if (data.conversationId) {
      await chrome.storage.local.set({ conversationId: data.conversationId });
    }

    // Store messages so popup can show them later
    await chrome.storage.local.set({
      lastVoiceChat: {
        userMessage: text,
        agentMessage: reply,
        timestamp: Date.now(),
      }
    });

    // Show response and speak it
    titleEl.textContent = "Speaking...";
    transcriptEl.textContent = reply;
    hintEl.textContent = "Click anywhere to close";

    // Allow closing by clicking
    document.body.addEventListener("click", () => window.close());

    await speakResponse(reply);

  } catch (err) {
    errorEl.textContent = err.message;
    hintEl.textContent = "Click anywhere to close";
    document.body.addEventListener("click", () => window.close());
  }
}

async function speakResponse(text) {
  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      // Start listening again for follow-up
      titleEl.textContent = "Listening... Speak again or close";
      voiceBars.style.display = "flex";
      btnStop.style.display = "flex";
      hintEl.textContent = "Stops automatically after 1.2s of silence";
      fullTranscript = "";
      hasSpoken = false;
      transcriptEl.textContent = "";
      startListening();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
    };

    await audio.play();
  } catch {
    // TTS failed silently
  }
}

function resetSilenceTimer() {
  clearSilenceTimer();
  silenceTimer = setTimeout(() => {
    if (hasSpoken) {
      stopAndSend();
    }
  }, SILENCE_TIMEOUT_MS);
}

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function animateBars() {
  const bars = voiceBars.querySelectorAll(".voice-bar");
  bars.forEach((bar) => {
    bar.style.height = Math.random() * 32 + 4 + "px";
  });
  setTimeout(() => {
    bars.forEach((bar) => {
      bar.style.height = "4px";
    });
  }, 200);
}
