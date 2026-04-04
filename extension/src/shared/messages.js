/**
 * Send a message to the service worker (background script).
 * @param {object} message - { action: string, ...payload }
 * @returns {Promise<any>} response from the service worker
 */
export function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      // Suppress "message port closed" warnings — expected when multiple listeners exist
      if (chrome.runtime.lastError) { /* ignored */ }
      resolve(response || null);
    });
  });
}

/**
 * Listen for messages from other parts of the extension.
 * @param {function} handler - (message, sender, sendResponse) => void
 */
export function onMessage(handler) {
  chrome.runtime.onMessage.addListener(handler);
}

/**
 * Listen for changes in chrome.storage.local.
 * @param {function} callback - (changes) => void
 */
export function onStorageChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      callback(changes);
    }
  });
}
