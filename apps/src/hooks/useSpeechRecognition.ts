"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechStatus = "idle" | "listening" | "error";

type UseSpeechRecognitionReturn = {
  isListening: boolean;
  isSupported: boolean;
  status: SpeechStatus;
  error: string | null;
  interimTranscript: string;
  startListening: (onStarted?: () => void) => void;
  stopListening: () => void;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionResultList = {
  length: number;
  item: (index: number) => SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  item: (index: number) => SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as Record<string, unknown>;
  return (win.SpeechRecognition ?? win.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

type SpeechRecognitionOptions = {
  onSilenceTimeout?: () => void;
  silenceTimeoutMs?: number;
};

export function useSpeechRecognition(
  onTranscript: (text: string) => void,
  options?: SpeechRecognitionOptions,
): UseSpeechRecognitionReturn {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const wantListeningRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSilenceTimeoutRef = useRef(options?.onSilenceTimeout);
  const silenceTimeoutMsRef = useRef(options?.silenceTimeoutMs ?? 2000);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onSilenceTimeoutRef.current = options?.onSilenceTimeout;
    silenceTimeoutMsRef.current = options?.silenceTimeoutMs ?? 2000;
  }, [options?.onSilenceTimeout, options?.silenceTimeoutMs]);

  const isSupported = typeof window !== "undefined" && getSpeechRecognitionConstructor() !== null;

  const onStartedRef = useRef<(() => void) | null>(null);

  const startRecognitionSession = useCallback(() => {
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setStatus("listening");
      setError(null);
      // Mic is now granted — fire the onStarted callback once
      if (onStartedRef.current) {
        onStartedRef.current();
        onStartedRef.current = null;
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }

      // Update interim display in real-time
      if (interim || finalTranscript) {
        setInterimTranscript(interim);
      }

      if (finalTranscript) {
        onTranscriptRef.current(finalTranscript);

        // Reset silence timer — auto-send after silence
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        if (onSilenceTimeoutRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            onSilenceTimeoutRef.current?.();
          }, silenceTimeoutMsRef.current);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") return;

      // "no-speech" in Safari — just restart silently
      if (event.error === "no-speech") {
        return;
      }

      const message =
        event.error === "not-allowed"
          ? "Microphone access denied. Please allow microphone permission."
          : `Speech recognition error: ${event.error}`;

      setError(message);
      setStatus("error");
      wantListeningRef.current = false;
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      // Safari fires onend after each phrase even with continuous=true.
      // Auto-restart if the user hasn't clicked stop.
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
          wantListeningRef.current = false;
          setStatus("idle");
        }
        return;
      }

      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setStatus("idle");
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError("Failed to start speech recognition.");
      setStatus("error");
      recognitionRef.current = null;
      wantListeningRef.current = false;
    }
  }, []);

  const startListening = useCallback((onStarted?: () => void) => {
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) {
      setError("Speech recognition is not supported in this browser.");
      setStatus("error");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    wantListeningRef.current = true;
    onStartedRef.current = onStarted ?? null;
    startRecognitionSession();
  }, [startRecognitionSession]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setStatus("idle");
      setInterimTranscript("");
    }
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening: status === "listening",
    isSupported,
    status,
    error,
    interimTranscript,
    startListening,
    stopListening,
  };
}
