"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechSynthesisStatus = "idle" | "speaking" | "error";

type SpeakOptions = {
  onPlaybackStart?: (durationMs: number) => void;
};

type UseSpeechSynthesisReturn = {
  isSpeaking: boolean;
  isSupported: boolean;
  status: SpeechSynthesisStatus;
  error: string | null;
  speak: (text: string, options?: SpeakOptions) => void;
  stop: () => void;
};

async function fetchElevenLabsAudio(
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch("/api/speech/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`TTS request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [status, setStatus] = useState<SpeechSynthesisStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const isSupported = typeof window !== "undefined";

  const cleanup = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      if (!text.trim()) return;

      // Stop any current playback
      stop();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus("speaking");
      setError(null);

      (async () => {
        try {
          const audioUrl = await fetchElevenLabsAudio(text, controller.signal);
          if (controller.signal.aborted) {
            URL.revokeObjectURL(audioUrl);
            return;
          }

          objectUrlRef.current = audioUrl;

          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          audio.onended = () => {
            if (audioRef.current === audio) {
              audioRef.current = null;
              cleanup();
              setStatus("idle");
            }
          };

          audio.onerror = () => {
            if (controller.signal.aborted) return;
            setError("Audio playback failed.");
            setStatus("error");
            cleanup();
          };

          // Wait for metadata to get duration
          await new Promise<void>((resolve, reject) => {
            audio.onloadedmetadata = () => resolve();
            audio.onerror = () => reject(new Error("Failed to load audio"));
            // If already loaded
            if (audio.readyState >= 1) resolve();
          });

          if (controller.signal.aborted) return;

          const durationMs = audio.duration * 1000;

          // Notify caller that playback is starting
          options?.onPlaybackStart?.(durationMs);

          await audio.play();
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;

          const message =
            err instanceof Error ? err.message : "TTS playback failed.";
          console.error("[TTS] Playback error:", err);
          setError(message);
          setStatus("error");
        }
      })();
    },
    [stop, cleanup],
  );

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      cleanup();
    };
  }, [cleanup]);

  return {
    isSpeaking: status === "speaking",
    isSupported,
    status,
    error,
    speak,
    stop,
  };
}
