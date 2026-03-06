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
export const selectActiveConversation = (state: RootState) =>
  state.chat.conversations.find(
    (conversation) => conversation.id === state.chat.activeConversationId,
  ) ?? null;
export const selectMessagesByConversationId = (state: RootState) =>
  state.chat.messagesByConversationId;
export const selectActiveConversationMessages = (state: RootState) => {
  const activeConversationId = state.chat.activeConversationId;
  if (!activeConversationId) {
    return EMPTY_MESSAGES;
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
