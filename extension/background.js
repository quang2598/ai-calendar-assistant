const AGENT_URL = "http://localhost:8000";
const TTS_URL = "http://localhost:3000/api/speech/synthesize";

// ─── Offscreen document for audio playback ───
let offscreenCreated = false;

async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Playing TTS audio responses",
    });
    offscreenCreated = true;
  } catch {
    offscreenCreated = true;
  }
}

// ─── Voice pending handler ───
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.voicePending && changes.voicePending.newValue) {
    const { message } = changes.voicePending.newValue;
    await chrome.storage.local.remove(["voicePending"]);
    await handleVoiceMessage(message);
  }
});

async function handleVoiceMessage(text) {
  try {
    const stored = await chrome.storage.local.get(["firebaseUid", "userInfo", "conversationId"]);
    const uid = stored.firebaseUid || stored.userInfo?.id || "extension-user";
    let conversationId = stored.conversationId;

    if (!conversationId) {
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      conversationId = `ext-${ts}`;
      await chrome.storage.local.set({ conversationId });
    }

    // Send to agent
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

    // Store messages so popup can show them
    await chrome.storage.local.set({
      lastVoiceChat: {
        userMessage: text,
        agentMessage: reply,
        timestamp: Date.now(),
      }
    });

    // Speak the response via offscreen
    await speakViaOffscreen(reply);

  } catch (err) {
    console.error("Voice message error:", err);
  }
}

async function speakViaOffscreen(text) {
  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) return;

    const buffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    await ensureOffscreen();
    chrome.runtime.sendMessage({ action: "playAudio", audioBase64: base64 });
  } catch (err) {
    console.error("TTS error:", err);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Message Handler ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openSidePanel") {
    chrome.windows.getCurrent((win) => {
      chrome.sidePanel
        .open({ windowId: win.id })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (message.action === "getAuthToken") {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ token });
      }
    });
    return true;
  }

  if (message.action === "removeCachedAuthToken") {
    chrome.identity.removeCachedAuthToken({ token: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "playTTS") {
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

  if (message.action === "stopTTS") {
    chrome.runtime.sendMessage({ action: "stopAudio" }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
      sendResponse({ success: true });
    });
    return true;
  }
});

// Enable side panel on all pages
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
