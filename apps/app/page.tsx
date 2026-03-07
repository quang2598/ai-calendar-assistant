"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import ChatShell from "@/app/chat/ChatShell";
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
  setComposerText,
  setActiveConversation,
  startNewConversationDraft,
} from "@/src/features/chat/chatSlice";
import {
  sendComposerMessage,
  startConversationsListener,
  startMessagesListener,
  stopMessagesListener,
  stopChatListeners,
} from "@/src/features/chat/chatThunks";
import { useAppDispatch, useAppSelector } from "@/src/hooks";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
    </div>
  );
}

export default function HomePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();

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
  const activeMessagesStatus = useAppSelector(selectActiveConversationMessagesStatus);
  const activeMessagesError = useAppSelector(selectActiveConversationMessagesError);
  const composerText = useAppSelector(selectComposerText);
  const sendingError = useAppSelector(selectSendingError);
  const isSendingMessage = useAppSelector(selectIsSendingMessage);
  const isAssistantTyping = useAppSelector(selectIsAssistantTyping);

  useEffect(() => {
    if (initialized && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [initialized, isAuthenticated, router]);

  useEffect(() => {
    if (!(initialized && isAuthenticated && user?.uid)) {
      return;
    }

    void dispatch(startConversationsListener(user.uid));

    return () => {
      void dispatch(stopChatListeners());
    };
  }, [dispatch, initialized, isAuthenticated, user?.uid]);

  async function handleSignOut() {
    await dispatch(signOutUser());
    router.replace("/auth/login");
  }

  function handleSelectConversation(conversationId: string) {
    dispatch(setActiveConversation(conversationId));
    if (user?.uid) {
      void dispatch(startMessagesListener({ uid: user.uid, conversationId }));
    }
  }

  function handleStartNewConversation() {
    dispatch(startNewConversationDraft());
    void dispatch(stopMessagesListener());
  }

  function handleComposerTextChange(value: string) {
    dispatch(setComposerText(value));
  }

  function handleSendMessage() {
    if (!user?.uid) {
      return;
    }

    void dispatch(sendComposerMessage({ uid: user.uid }));
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
      onStartNewConversation={handleStartNewConversation}
      onComposerTextChange={handleComposerTextChange}
      onSendMessage={handleSendMessage}
      onSelectConversation={handleSelectConversation}
      onSignOut={handleSignOut}
      isSigningOut={status === "authenticating"}
    />
  );
}
