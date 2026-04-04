import { config } from "../config.js";
import { sendMessage } from "./messages.js";

let currentAbort = null;

/**
 * Speak text using ElevenLabs TTS API.
 * Fetches full audio then plays — no chunking for smooth playback.
 */
export async function speakText(text) {
  if (!text || !config.elevenLabsApiKey) return;

  stopSpeaking();

  const controller = new AbortController();
  currentAbort = controller;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": config.elevenLabsApiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok || currentAbort !== controller) return;

    const buffer = await res.arrayBuffer();
    if (currentAbort !== controller) return;

    const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
    sendMessage({ action: "playTTS", audioBase64: base64 });
  } catch (err) {
    if (err.name === "AbortError") return;
    console.warn("TTS failed:", err);
  }
}

/**
 * Stop any currently playing TTS audio.
 */
export function stopSpeaking() {
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  sendMessage({ action: "stopTTS" });
}

function uint8ArrayToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
