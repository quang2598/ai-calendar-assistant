let currentAudio = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "playAudio") {
    // Stop any current audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }

    const blob = new Blob(
      [Uint8Array.from(atob(message.audioBase64), c => c.charCodeAt(0))],
      { type: "audio/mpeg" }
    );
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      chrome.runtime.sendMessage({ action: "audioEnded" });
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      chrome.runtime.sendMessage({ action: "audioError" });
    };

    audio.play()
      .then(() => sendResponse({ success: true }))
      .catch(() => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        sendResponse({ success: false });
      });

    return true;
  }

  if (message.action === "stopAudio") {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    sendResponse({ success: true });
  }
});
