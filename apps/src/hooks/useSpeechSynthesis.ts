"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechSynthesisStatus = "idle" | "speaking" | "error";

type UseSpeechSynthesisReturn = {
  isSpeaking: boolean;
  isSupported: boolean;
  status: SpeechSynthesisStatus;
  error: string | null;
  speak: (text: string) => void;
  stop: () => void;
};

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [status, setStatus] = useState<SpeechSynthesisStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported = typeof window !== "undefined" && getSynthesis() !== null;

  const stop = useCallback(() => {
    const synth = getSynthesis();
    if (synth) {
      synth.cancel();
    }
    utteranceRef.current = null;
    setStatus("idle");
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synth = getSynthesis();
      if (!synth) {
        setError("Speech synthesis is not supported in this browser.");
        setStatus("error");
        return;
      }

      if (!text.trim()) return;

      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onstart = () => {
        setStatus("speaking");
        setError(null);
      };

      utterance.onend = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null;
          setStatus("idle");
        }
      };

      utterance.onerror = (event) => {
        if (event.error === "canceled" || event.error === "interrupted") return;
        setError(`Speech synthesis error: ${event.error}`);
        setStatus("error");
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      synth.speak(utterance);
    },
    [],
  );

  useEffect(() => {
    return () => {
      const synth = getSynthesis();
      if (synth) {
        synth.cancel();
      }
      utteranceRef.current = null;
    };
  }, []);

  return {
    isSpeaking: status === "speaking",
    isSupported,
    status,
    error,
    speak,
    stop,
  };
}
