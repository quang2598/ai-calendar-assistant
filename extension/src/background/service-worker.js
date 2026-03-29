// ─── VietCalenAI Service Worker ───
// Central hub for auth, message routing, and offscreen management.

// ─── Offscreen Document Management ───

async function ensureOffscreen() {
  const hasDoc = await chrome.offscreen.hasDocument();
  console.log("[service-worker] hasDocument:", hasDoc);
  if (hasDoc) return;

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK", "USER_MEDIA"],
      justification: "Wake word detection and TTS audio playback",
    });
    console.log("[service-worker] offscreen created successfully");
    // Auto-start wake word after offscreen is ready
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "startWakeWord" }, (res) => {
        if (chrome.runtime.lastError) {
          console.log("[service-worker] startWakeWord error:", chrome.runtime.lastError.message);
        } else {
          console.log("[service-worker] startWakeWord result:", res);
        }
      });
    }, 1000);
  } catch (err) {
    console.log("[service-worker] offscreen create error:", err.message);
  }
}

// Create offscreen document on startup
ensureOffscreen();

// Keep offscreen alive — recreate if service worker restarts
chrome.runtime.onStartup.addListener(() => ensureOffscreen());
chrome.runtime.onInstalled.addListener(() => ensureOffscreen());

// ─── Message Handler ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === "getAuthToken") {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ token });
      }
    });
    return true;
  }

  if (action === "removeCachedAuthToken") {
    chrome.identity.removeCachedAuthToken({ token: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (action === "openSidePanel") {
    chrome.windows.getCurrent((win) => {
      chrome.sidePanel
        .open({ windowId: win.id })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  // Voice commands handled by offscreen — ensure it exists, then ignore
  if (action === "startVoiceRecording" || action === "stopVoiceRecording" || action === "startWakeWord" || action === "stopWakeWord") {
    ensureOffscreen();
    return false; // Let offscreen handle it
  }

  // Voice status messages from offscreen to popup — just pass through
  if (action === "voiceStarted" || action === "voiceTranscript" || action === "voiceStopped" || action === "voiceAutoSend" || action === "voiceError") {
    return false;
  }

  if (action === "openMicPermission") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("mic-permission.html"),
      active: true,
    });
    sendResponse({ success: true });
    return true;
  }

  if (action === "micPermissionGranted") {
    // Mic permission granted — restart wake word detection
    ensureOffscreen().then(() => {
      chrome.runtime.sendMessage({ action: "startWakeWord" }).catch(() => {});
    });
    sendResponse({ success: true });
    return true;
  }

  if (action === "wakeWordDetected") {
    // Open the popup when "Hey Viet" is detected
    chrome.action.openPopup().catch(() => {
      // Fallback: some Chrome versions don't support openPopup()
      console.warn("Could not auto-open popup");
    });
    sendResponse({ success: true });
    return true;
  }

  if (action === "playTTS") {
    ensureOffscreen().then(() => {
      chrome.runtime.sendMessage(
        { action: "playAudio", audioBase64: message.audioBase64 },
        () => {
          if (chrome.runtime.lastError) { /* ignore */ }
          sendResponse({ success: true });
        }
      );
    });
    return true;
  }

  if (action === "stopTTS") {
    chrome.runtime.sendMessage({ action: "stopAudio" }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
      sendResponse({ success: true });
    });
    return true;
  }
});

// ─── Side Panel Config ───

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// ─── Auth State Change Listener ───
// When auth changes, notify sidepanel to update UI.

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.authToken || changes.firebaseUid) {
    // Broadcast auth change to all extension pages
    chrome.runtime.sendMessage({ action: "authChanged" }).catch(() => {});
  }
});
