// ─── VietCalenAI Offscreen Document ───
// Handles: "Hey Viet" wake word, voice recording for popup, TTS audio playback

console.log("[offscreen] loaded successfully");

let currentAudio = null;

// ─── Wake Word Detection ───

const WAKE_PHRASES = ["hey viet", "hey veet", "hey viet ai", "hey v"];
const SILENCE_TIMEOUT_MS = 1200;

let wakeRecognition = null;
let wakeActive = false;

// ─── Voice Recording for Popup ───

let voiceRecognition = null;
let voiceActive = false;
let voiceSilenceTimer = null;
let voiceHasSpoken = false;

function startWakeWordDetection() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  wakeRecognition = new SpeechRecognition();
  wakeRecognition.continuous = true;
  wakeRecognition.interimResults = true;
  wakeRecognition.lang = "en-US";

  wakeRecognition.onstart = () => {
    wakeActive = true;
    console.log("[offscreen] wake word listening started");
  };

  wakeRecognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.toLowerCase().trim();
      if (WAKE_PHRASES.some((p) => transcript.includes(p))) {
        console.log("[offscreen] WAKE WORD DETECTED:", transcript);
        chrome.runtime.sendMessage({ action: "wakeWordDetected" }).catch(() => {});
        chrome.storage.local.set({ wakeWordTriggered: true });
        stopWakeWordDetection();
        setTimeout(() => startWakeWordDetection(), 3000);
        return;
      }
    }
  };

  wakeRecognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "not-allowed") {
      wakeActive = false;
      console.log("[offscreen] wake word mic not allowed");
      return;
    }
    console.log("[offscreen] wake word error:", event.error);
    setTimeout(() => { if (!wakeActive) startWakeWordDetection(); }, 1000);
  };

  wakeRecognition.onend = () => {
    wakeActive = false;
    // Don't auto-restart if voice recording is active
    if (!voiceActive) {
      setTimeout(() => startWakeWordDetection(), 100);
    }
  };

  try { wakeRecognition.start(); } catch {}
}

function stopWakeWordDetection() {
  wakeActive = false;
  if (wakeRecognition) {
    wakeRecognition.onend = null;
    wakeRecognition.abort();
    wakeRecognition = null;
  }
}

// ─── Voice Recording (delegated from popup) ───

function startVoiceRecording() {
  // Stop wake word while recording
  stopWakeWordDetection();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    chrome.runtime.sendMessage({ action: "voiceError", error: "Speech recognition not supported" }).catch(() => {});
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.lang = "en-US";

  voiceRecognition.onstart = () => {
    voiceActive = true;
    voiceHasSpoken = false;
    chrome.runtime.sendMessage({ action: "voiceStarted" }).catch(() => {});
  };

  voiceRecognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    voiceHasSpoken = true;
    resetVoiceSilenceTimer();

    if (finalTranscript) {
      chrome.runtime.sendMessage({
        action: "voiceTranscript",
        text: finalTranscript,
      }).catch(() => {});
    }
  };

  voiceRecognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "not-allowed") {
      stopVoiceRecording();
      return;
    }
    chrome.runtime.sendMessage({
      action: "voiceError",
      error: event.error,
    }).catch(() => {});
    stopVoiceRecording();
  };

  voiceRecognition.onend = () => {
    if (voiceActive) {
      try { voiceRecognition.start(); } catch { stopVoiceRecording(); }
    }
  };

  try {
    voiceRecognition.start();
  } catch (err) {
    chrome.runtime.sendMessage({ action: "voiceError", error: err.message }).catch(() => {});
  }
}

function stopVoiceRecording() {
  voiceActive = false;
  clearVoiceSilenceTimer();
  if (voiceRecognition) {
    voiceRecognition.onend = null;
    voiceRecognition.abort();
    voiceRecognition = null;
  }
  chrome.runtime.sendMessage({ action: "voiceStopped" }).catch(() => {});
  // Resume wake word detection
  setTimeout(() => startWakeWordDetection(), 500);
}

function resetVoiceSilenceTimer() {
  clearVoiceSilenceTimer();
  voiceSilenceTimer = setTimeout(() => {
    if (voiceHasSpoken && voiceActive) {
      stopVoiceRecording();
      chrome.runtime.sendMessage({ action: "voiceAutoSend" }).catch(() => {});
    }
  }, SILENCE_TIMEOUT_MS);
}

function clearVoiceSilenceTimer() {
  if (voiceSilenceTimer) {
    clearTimeout(voiceSilenceTimer);
    voiceSilenceTimer = null;
  }
}

// Don't auto-start wake word — wait for startWakeWord message

// ─── Message Handler ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getGeoLocation") {
    navigator.geolocation.getCurrentPosition(
      (pos) => sendResponse({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => sendResponse(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );
    return true;
  }

  if (message.action === "startVoiceRecording") {
    startVoiceRecording();
    sendResponse({ success: true });
    return;
  }

  if (message.action === "stopVoiceRecording") {
    stopVoiceRecording();
    sendResponse({ success: true });
    return;
  }

  if (message.action === "startWakeWord") {
    if (!wakeActive) startWakeWordDetection();
    sendResponse({ success: true });
    return;
  }

  if (message.action === "stopWakeWord") {
    stopWakeWordDetection();
    sendResponse({ success: true });
    return;
  }

  // ─── TTS Audio Playback (queued for streaming) ───
  if (message.action === "playAudio") {
    queueAudio(message.audioBase64);
    sendResponse({ success: true });
    return;
  }

  if (message.action === "stopAudio") {
    stopAllAudio();
    sendResponse({ success: true });
    return;
  }
});

// ─── Audio Queue for Streaming TTS ───
const audioQueue = [];
let isPlaying = false;

function queueAudio(base64) {
  audioQueue.push(base64);
  if (!isPlaying) playNext();
}

function playNext() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    currentAudio = null;
    chrome.runtime.sendMessage({ action: "audioEnded" }).catch(() => {});
    return;
  }

  isPlaying = true;
  const base64 = audioQueue.shift();

  const blob = new Blob(
    [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
    { type: "audio/mpeg" }
  );
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;

  audio.onended = () => {
    URL.revokeObjectURL(url);
    playNext();
  };

  audio.onerror = () => {
    URL.revokeObjectURL(url);
    playNext();
  };

  audio.play().catch(() => {
    URL.revokeObjectURL(url);
    playNext();
  });
}

function stopAllAudio() {
  audioQueue.length = 0;
  isPlaying = false;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}
