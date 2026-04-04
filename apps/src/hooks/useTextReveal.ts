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
  /** Hide the next new system message until reveal starts (prevents flash) */
  setWaitingForReveal: (waiting: boolean, messageId?: string, knownIds?: string[]) => void;
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
  const [hiddenMessageId, setHiddenMessageId] = useState<string | null>(null);
  // Track which message IDs existed before pending mode was set
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
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
    setHiddenMessageId(null);
  }, [clearTimer]);

  const setWaitingForReveal = useCallback((waiting: boolean, messageId?: string, knownIds?: string[]) => {
    if (waiting) {
      if (knownIds) {
        knownMessageIdsRef.current = new Set(knownIds);
      }
      setHiddenMessageId(messageId ?? "__pending__");
    } else {
      knownMessageIdsRef.current.clear();
      setHiddenMessageId(null);
    }
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
      setHiddenMessageId(null);

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
      setHiddenMessageId(null);

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

      // Hide specific message by ID
      if (hiddenMessageId === messageId) {
        return "";
      }

      // Pending mode: hide any NEW message (not known before pending was set)
      if (hiddenMessageId === "__pending__" && !knownMessageIdsRef.current.has(messageId)) {
        return "";
      }

      return fullText;
    },
    [revealState, hiddenMessageId],
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
