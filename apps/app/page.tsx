"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useCallback, useRef } from "react";

import ChatShell from "@/app/chat/ChatShell";
import { auth } from "@/src/lib/firebase";
import { getCurrentAuthUid } from "@/src/services/auth/firebaseAuthService";
import {
  selectAuthInitialized,
  selectAuthStatus,
  selectAuthUser,
  selectIsAuthenticated,
} from "@/src/features/auth/authSelectors";
import { signOutUser } from "@/src/features/auth/authThunks";
import {
  selectActiveConversation,
  selectActiveConversationId,
  selectActiveConversationMessages,
  selectActiveConversationMessagesError,
  selectActiveConversationMessagesStatus,
  selectComposerText,
  selectConversations,
  selectConversationsError,
  selectConversationsStatus,
  selectIsAssistantTyping,
  selectIsSendingMessage,
  selectSendingError,
} from "@/src/features/chat/chatSelectors";
import {
  appendComposerText,
  setComposerText,
  setActiveConversation,
  startNewConversationDraft,
} from "@/src/features/chat/chatSlice";
import {
  sendComposerMessageStreaming,
  startConversationsListener,
  startMessagesListener,
  stopMessagesListener,
  stopChatListeners,
} from "@/src/features/chat/chatThunks";
import { useAppDispatch, useAppSelector } from "@/src/hooks";
import { useGeolocation } from "@/src/hooks/useGeolocation";
import { useSpeechRecognition } from "@/src/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/src/hooks/useSpeechSynthesis";
import { useAudioVisualizer } from "@/src/hooks/useAudioVisualizer";
import { useTextReveal } from "@/src/hooks/useTextReveal";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
    </div>
  );
}

function HomePageContent() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [calendarConnectError, setCalendarConnectError] = useState<
    string | null
  >(null);

  // Request user's geolocation for location-based service lookups
  const { coordinates: userLocation } = useGeolocation(true, false);

  // Track whether current interaction is voice or text for TTS gating
  const inputModeRef = useRef<"text" | "voice">("text");

  const initialized = useAppSelector(selectAuthInitialized);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectAuthUser);
  const conversations = useAppSelector(selectConversations);
  const conversationsStatus = useAppSelector(selectConversationsStatus);
  const conversationsError = useAppSelector(selectConversationsError);
  const activeConversationId = useAppSelector(selectActiveConversationId);
  const activeConversation = useAppSelector(selectActiveConversation);
  const activeMessages = useAppSelector(selectActiveConversationMessages);
  const activeMessagesStatus = useAppSelector(
    selectActiveConversationMessagesStatus,
  );
  const activeMessagesError = useAppSelector(
    selectActiveConversationMessagesError,
  );
  const composerText = useAppSelector(selectComposerText);
  const sendingError = useAppSelector(selectSendingError);
  const isSendingMessage = useAppSelector(selectIsSendingMessage);
  const isAssistantTyping = useAppSelector(selectIsAssistantTyping);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      dispatch(appendComposerText(text));
    },
    [dispatch],
  );

  // Keep refs in sync for the silence timeout callback
  const composerTextRef = useRef(composerText);
  useEffect(() => {
    composerTextRef.current = composerText;
  }, [composerText]);

  const sendingRef = useRef(isSendingMessage);
  useEffect(() => {
    sendingRef.current = isSendingMessage;
  }, [isSendingMessage]);

  // Ref for the silence timeout handler — populated after dependencies are defined
  const handleSilenceTimeoutRef = useRef<() => void>(() => {});

  const {
    isListening,
    isSupported: isVoiceSupported,
    startListening,
    stopListening,
    error: voiceError,
    interimTranscript,
  } = useSpeechRecognition(handleVoiceTranscript, {
    onSilenceTimeout: useCallback(() => {
      handleSilenceTimeoutRef.current();
    }, []),
    silenceTimeoutMs: 2000,
  });

  const {
    volume: micVolume,
    frequencies: micFrequencies,
    startVisualizer,
    stopVisualizer,
  } = useAudioVisualizer();

  function handleMicToggle() {
    if (isListening) {
      inputModeRef.current = "text";
      stopListening();
      stopVisualizer();
    } else {
      startListening(() => {
        void startVisualizer();
      });
    }
  }

  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis();

  const {
    getVisibleText,
    isRevealing,
    setWaitingForReveal,
    startReveal,
    startRevealSynced,
    stopReveal,
  } = useTextReveal();

  // Keep refs for TTS and reveal callbacks
  const speakRef = useRef(speak);
  const setWaitingRef = useRef(setWaitingForReveal);
  const startRevealRef = useRef(startReveal);
  const startRevealSyncedRef = useRef(startRevealSynced);
  useEffect(() => {
    speakRef.current = speak;
    setWaitingRef.current = setWaitingForReveal;
    startRevealRef.current = startReveal;
    startRevealSyncedRef.current = startRevealSynced;
  }, [speak, setWaitingForReveal, startReveal, startRevealSynced]);

  useEffect(() => {
    if (initialized && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [initialized, isAuthenticated, router]);

  useEffect(() => {
    if (!(initialized && isAuthenticated)) {
      return;
    }

    const uid = getCurrentAuthUid();
    if (!uid) {
      return;
    }

    void dispatch(startConversationsListener());

    return () => {
      void dispatch(stopChatListeners());
    };
  }, [dispatch, initialized, isAuthenticated]);

  async function handleSignOut() {
    await dispatch(signOutUser());
    router.replace("/auth/login");
  }

  function handleSelectConversation(conversationId: string) {
    dispatch(setActiveConversation(conversationId));
    void dispatch(startMessagesListener({ conversationId }));
  }

  function handleStartNewConversation() {
    dispatch(startNewConversationDraft());
    void dispatch(stopMessagesListener());
  }

  function handleComposerTextChange(value: string) {
    dispatch(setComposerText(value));
  }

  function handleSendMessage() {
    const locationPayload = userLocation
      ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          accuracy: userLocation.accuracy,
        }
      : null;

    if (inputModeRef.current === "voice") {
      // Hide the next system message before it arrives (prevents flash)
      // Pass current message IDs so only NEW messages get hidden
      const currentIds = activeMessages.map((m) => m.id);
      setWaitingRef.current(true, undefined, currentIds);
      let fullText = "";
      void dispatch(
        sendComposerMessageStreaming({
          userLocation: locationPayload,
          suppressStreamingUI: true,
          onStreamChunk: (chunk) => {
            if (chunk.type === "text") {
              fullText += chunk.text;
            } else if (chunk.type === "done") {
              const messageId = chunk.messageId;
              if (messageId) {
                setWaitingRef.current(true, messageId);
              }
              if (fullText.trim()) {
                speakRef.current(fullText, {
                  onPlaybackStart: (durationMs) => {
                    if (messageId) {
                      startRevealSyncedRef.current(
                        messageId,
                        fullText,
                        durationMs,
                      );
                    }
                  },
                });
              }
              inputModeRef.current = "text";
            }
          },
        }),
      );
    } else {
      // Hide the next system message before it arrives (prevents flash)
      const currentIds = activeMessages.map((m) => m.id);
      setWaitingRef.current(true, undefined, currentIds);
      let fullText = "";
      void dispatch(
        sendComposerMessageStreaming({
          userLocation: locationPayload,
          suppressStreamingUI: true,
          onStreamChunk: (chunk) => {
            if (chunk.type === "text") {
              fullText += chunk.text;
            } else if (chunk.type === "done") {
              const messageId = chunk.messageId;
              if (messageId) {
                setWaitingRef.current(true, messageId);
              }
              if (messageId && fullText.trim()) {
                startRevealRef.current(messageId, fullText);
              }
            }
          },
        }),
      );
    }
  }

  // Wire up the silence timeout handler now that all dependencies are available
  handleSilenceTimeoutRef.current = () => {
    if (!composerTextRef.current.trim() || sendingRef.current) return;
    inputModeRef.current = "voice";
    stopListening();
    stopVisualizer();
    handleSendMessage();
  };

  async function handleConnectGoogleCalendar() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setCalendarConnectError("User is not authenticated.");
      return;
    }

    setCalendarConnectError(null);
    setIsConnectingCalendar(true);

    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(
        "/api/integrations/google-calendar/connect",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "x-oauth-mode": "json",
          },
        },
      );

      if (!response.ok) {
        let message = "Could not start Google Calendar connection.";
        try {
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          message = payload.error?.message ?? message;
        } catch {
          message = "Could not start Google Calendar connection.";
        }

        throw new Error(message);
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload.url) {
        throw new Error(
          "Connect endpoint did not return an authorization URL.",
        );
      }

      window.location.assign(payload.url);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not connect Google Calendar.";
      setCalendarConnectError(message);
      setIsConnectingCalendar(false);
    }
  }

  if (!initialized) {
    return <FullScreenSpinner />;
  }

  if (!isAuthenticated || !user) {
    return <FullScreenSpinner />;
  }

  const userDisplayName = user.displayName;
  const userEmail = user.email;
  const userPhotoURL = user.photoURL;
  const callbackStatus = searchParams.get("googleCalendar");
  const callbackCode = searchParams.get("code");
  const callbackResult = searchParams.get("result");

  const calendarConnectedMessage =
    callbackStatus === "connected"
      ? callbackResult === "REFRESH_TOKEN_REUSED"
        ? "Google Calendar connected. Existing refresh token was reused."
        : "Google Calendar connected successfully."
      : null;
  const callbackErrorMessage =
    callbackStatus === "error"
      ? `Google Calendar connection failed: ${callbackCode}.`
      : null;
  const calendarErrorMessage = calendarConnectError ?? callbackErrorMessage;

  return (
    <ChatShell
      conversations={conversations}
      activeConversationId={activeConversationId}
      activeConversation={activeConversation}
      activeMessages={activeMessages}
      activeMessagesStatus={activeMessagesStatus}
      activeMessagesError={activeMessagesError}
      composerText={composerText}
      sendingError={sendingError}
      isSendingMessage={isSendingMessage}
      isAssistantTyping={isAssistantTyping}
      conversationsStatus={conversationsStatus}
      conversationsError={conversationsError}
      userDisplayName={userDisplayName}
      userEmail={userEmail}
      userPhotoURL={userPhotoURL}
      isConnectingCalendar={isConnectingCalendar}
      onConnectGoogleCalendar={handleConnectGoogleCalendar}
      calendarConnectionError={calendarErrorMessage}
      calendarConnectionSuccess={calendarConnectedMessage}
      onStartNewConversation={handleStartNewConversation}
      onComposerTextChange={handleComposerTextChange}
      onSendMessage={handleSendMessage}
      onSelectConversation={handleSelectConversation}
      onSignOut={handleSignOut}
      isSigningOut={status === "authenticating"}
      isListening={isListening}
      isVoiceSupported={isVoiceSupported}
      onMicToggle={handleMicToggle}
      voiceError={voiceError}
      micVolume={micVolume}
      micFrequencies={micFrequencies}
      interimTranscript={interimTranscript}
      isSpeaking={isSpeaking}
      onStopSpeaking={() => {
        stopSpeaking();
        stopReveal();
      }}
      getVisibleText={getVisibleText}
      isRevealingMessage={isRevealing}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <HomePageContent />
    </Suspense>
  );
}
