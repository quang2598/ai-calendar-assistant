"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RevealState = {
  messageId: string;
  fullText: string;
  visibleCharCount: number;
};

type UseTextRevealReturn = {
  getVisibleText: (messageId: string, fullText: string) => string;
  isRevealing: (messageId: string) => boolean;
  /** Block all new system messages from showing until reveal starts */
  setWaitingForReveal: (waiting: boolean) => void;
  /** Start character-by-character reveal with variable speed (like the extension) */
  startReveal: (messageId: string, fullText: string) => void;
  /** Start reveal synced to audio duration */
  startRevealSynced: (messageId: string, fullText: string, durationMs: number) => void;
  stopReveal: () => void;
};

// Set of message IDs that have already been fully revealed (don't re-animate)
const revealedMessagesSet = new Set<string>();

export function useTextReveal(): UseTextRevealReturn {
  const [revealState, setRevealState] = useState<RevealState | null>(null);
  const [waitingForReveal, setWaitingForRevealState] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopReveal = useCallback(() => {
    clearTimer();
    setRevealState(null);
    setWaitingForRevealState(false);
  }, [clearTimer]);

  const setWaitingForReveal = useCallback((waiting: boolean) => {
    setWaitingForRevealState(waiting);
  }, []);

  const markComplete = useCallback((messageId: string) => {
    revealedMessagesSet.add(messageId);
    setRevealState(null);
  }, []);

  // Character-by-character with variable speed (extension style)
  const startReveal = useCallback(
    (messageId: string, fullText: string) => {
      clearTimer();
      cancelledRef.current = false;
      setWaitingForRevealState(false);

      if (!fullText) return;
      if (revealedMessagesSet.has(messageId)) return; // Already revealed

      setRevealState({ messageId, fullText, visibleCharCount: 0 });

      let index = 0;

      function scheduleNext() {
        if (cancelledRef.current || index >= fullText.length) {
          if (!cancelledRef.current) {
            markComplete(messageId);
          }
          return;
        }

        const char = fullText[index];
        const delay =
          char === " " ? 10 : ".!?,;:".includes(char) ? 80 : 20;

        timerRef.current = setTimeout(() => {
          index++;
          setRevealState((prev) => {
            if (!prev || prev.messageId !== messageId) return null;
            return { ...prev, visibleCharCount: index };
          });
          scheduleNext();
        }, delay);
      }

      scheduleNext();
    },
    [clearTimer, markComplete],
  );

  // Synced to audio duration
  const startRevealSynced = useCallback(
    (messageId: string, fullText: string, durationMs: number) => {
      clearTimer();
      cancelledRef.current = false;
      setWaitingForRevealState(false);

      if (!fullText) return;
      if (revealedMessagesSet.has(messageId)) return;

      const totalChars = fullText.length;
      const intervalMs = Math.max(durationMs / totalChars, 5);

      setRevealState({ messageId, fullText, visibleCharCount: 0 });

      let index = 0;

      function scheduleNext() {
        if (cancelledRef.current || index >= totalChars) {
          if (!cancelledRef.current) {
            markComplete(messageId);
          }
          return;
        }

        timerRef.current = setTimeout(() => {
          index++;
          setRevealState((prev) => {
            if (!prev || prev.messageId !== messageId) return null;
            return { ...prev, visibleCharCount: index };
          });
          scheduleNext();
        }, intervalMs);
      }

      scheduleNext();
    },
    [clearTimer, markComplete],
  );

  const getVisibleText = useCallback(
    (messageId: string, fullText: string): string => {
      // Currently being revealed — show partial text
      if (revealState && revealState.messageId === messageId) {
        return revealState.fullText.slice(0, revealState.visibleCharCount);
      }

      // Already fully revealed — show full text
      if (revealedMessagesSet.has(messageId)) {
        return fullText;
      }

      // Waiting for reveal to start (voice mode: audio being fetched)
      // Hide any new system message to prevent flash
      if (waitingForReveal) {
        return "";
      }

      return fullText;
    },
    [revealState, waitingForReveal],
  );

  const isRevealing = useCallback(
    (messageId: string): boolean => {
      return revealState !== null && revealState.messageId === messageId;
    },
    [revealState],
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    getVisibleText,
    isRevealing,
    setWaitingForReveal,
    startReveal,
    startRevealSynced,
    stopReveal,
  };
}
