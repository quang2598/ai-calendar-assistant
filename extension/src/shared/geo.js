// Geolocation — memory only, never persisted to Firestore
// Uses chrome.storage.session to share between popup and offscreen

/**
 * Get the user's current position.
 * Requests from offscreen document (has full page context for geolocation).
 * Falls back to cached position from chrome.storage.session.
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function getCurrentPosition() {
  // Check session storage for cached position
  try {
    const { geoPosition } = await chrome.storage.session.get(["geoPosition"]);
    if (geoPosition && Date.now() - geoPosition.timestamp < 300000) {
      return { lat: geoPosition.lat, lng: geoPosition.lng };
    }
  } catch {}

  // Request fresh position from offscreen via service worker
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getGeoLocation" }, (res) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res);
      });
    });

    if (response?.lat && response?.lng) {
      await chrome.storage.session.set({
        geoPosition: { lat: response.lat, lng: response.lng, timestamp: Date.now() },
      });
      return { lat: response.lat, lng: response.lng };
    }
  } catch {}

  return null;
}
