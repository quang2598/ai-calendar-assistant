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

  if (action === "signInWithGoogle") {
    (async () => {
      try {
        const redirectUrl = chrome.identity.getRedirectURL();
        const scopes = [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].join(" ");

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", message.webOauthClientId);
        authUrl.searchParams.set("redirect_uri", redirectUrl);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scopes);

        const responseUrl = await new Promise((resolve, reject) => {
          chrome.identity.launchWebAuthFlow(
            { url: authUrl.toString(), interactive: true },
            (response) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(response);
            }
          );
        });

        const code = new URL(responseUrl).searchParams.get("code");
        if (!code) throw new Error("No authorization code received.");

        // Exchange code for access token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: message.webOauthClientId,
            client_secret: message.webOauthClientSecret,
            redirect_uri: redirectUrl,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({}));
          throw new Error(err.error_description || "Sign-in failed.");
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) throw new Error("No access token received.");

        // Get user info
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const userInfo = await userRes.json();

        // Save to storage (Firebase sign-in will happen in popup on reopen)
        await chrome.storage.local.set({ authToken: accessToken, userInfo });
        sendResponse({ success: true, accessToken, userInfo });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (action === "connectCalendar") {
    (async () => {
      try {
        const redirectUrl = chrome.identity.getRedirectURL();
        const scopes = "https://www.googleapis.com/auth/calendar";

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", message.webOauthClientId);
        authUrl.searchParams.set("redirect_uri", redirectUrl);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scopes);
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");

        const responseUrl = await new Promise((resolve, reject) => {
          chrome.identity.launchWebAuthFlow(
            { url: authUrl.toString(), interactive: true },
            (response) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(response);
            }
          );
        });

        const code = new URL(responseUrl).searchParams.get("code");
        if (!code) throw new Error("No authorization code received.");

        // Get uid from storage
        const { firebaseUid } = await chrome.storage.local.get(["firebaseUid"]);
        if (!firebaseUid) throw new Error("Not signed in.");

        // Send code to Next.js backend — exchanges for tokens and saves to Firestore
        const res = await fetch(`${message.backendUrl}/api/integrations/google-calendar/exchange-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: firebaseUid,
            code,
            redirectUri: redirectUrl,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || "Failed to connect calendar.");
        }

        const data = await res.json();

        // Save access token + calendar state locally
        // Side panel uses authToken to call Google Calendar API directly
        const storageData = {
          calendarConnected: true,
          calendarConnectedAt: Date.now(),
        };
        if (data.accessToken) {
          storageData.authToken = data.accessToken;
        }
        await chrome.storage.local.set(storageData);

        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
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
