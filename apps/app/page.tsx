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
  selectComposerPlaceholderText,
  selectConversations,
  selectConversationsError,
  selectConversationsStatus,
} from "@/src/features/chat/chatSelectors";
import {
  setActiveConversation,
} from "@/src/features/chat/chatSlice";
import {
  startConversationsListener,
  startMessagesListener,
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
  const composerPlaceholderText = useAppSelector(selectComposerPlaceholderText);

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

  if (!initialized) {
    return <FullScreenSpinner />;
  }

  if (!isAuthenticated || !user) {
    return <FullScreenSpinner />;
  }

  const userLabel = user.displayName ?? user.email ?? "Signed-in user";

  return (
    <ChatShell
      conversations={conversations}
      activeConversationId={activeConversationId}
      activeConversation={activeConversation}
      activeMessages={activeMessages}
      activeMessagesStatus={activeMessagesStatus}
      activeMessagesError={activeMessagesError}
      composerPlaceholderText={composerPlaceholderText}
      conversationsStatus={conversationsStatus}
      conversationsError={conversationsError}
      userLabel={userLabel}
      onSelectConversation={handleSelectConversation}
      onSignOut={handleSignOut}
      isSigningOut={status === "authenticating"}
    />
  );
}
