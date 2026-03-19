import type { RootState } from "@/src/store";
import type { ConversationMessage } from "@/src/types/chat";

const EMPTY_MESSAGES: ConversationMessage[] = [];

export const selectConversations = (state: RootState) => state.chat.conversations;
export const selectConversationsStatus = (state: RootState) =>
  state.chat.conversationsStatus;
export const selectConversationsError = (state: RootState) =>
  state.chat.conversationsError;
export const selectActiveConversationId = (state: RootState) =>
  state.chat.activeConversationId;
export const selectComposerText = (state: RootState) => state.chat.composerText;
export const selectSendingStatus = (state: RootState) => state.chat.sendingStatus;
export const selectSendingError = (state: RootState) => state.chat.sendingError;
export const selectIsAssistantTyping = (state: RootState) =>
  state.chat.isAssistantTyping;
export const selectIsSendingMessage = (state: RootState) =>
  state.chat.sendingStatus === "loading";
export const selectActiveConversation = (state: RootState) =>
  state.chat.conversations.find(
    (conversation) => conversation.id === state.chat.activeConversationId,
  ) ?? null;
export const selectMessagesByConversationId = (state: RootState) =>
  state.chat.messagesByConversationId;
export const selectActiveConversationMessages = (state: RootState) => {
  const activeConversationId = state.chat.activeConversationId;
  if (!activeConversationId) {
    // Show optimistic messages for pending (new) conversations
    return state.chat.messagesByConversationId["__pending__"] ?? EMPTY_MESSAGES;
  }

  return state.chat.messagesByConversationId[activeConversationId] ?? EMPTY_MESSAGES;
};
export const selectActiveConversationMessagesStatus = (state: RootState) => {
  const activeConversationId = state.chat.activeConversationId;
  if (!activeConversationId) {
    return "idle" as const;
  }

  return state.chat.messagesStatusByConversationId[activeConversationId] ?? "idle";
};
export const selectActiveConversationMessagesError = (state: RootState) => {
  const activeConversationId = state.chat.activeConversationId;
  if (!activeConversationId) {
    return null;
  }

  return state.chat.messagesErrorByConversationId[activeConversationId] ?? null;
};
export const selectComposerPlaceholderText = (state: RootState) =>
  state.chat.composerPlaceholderText;
