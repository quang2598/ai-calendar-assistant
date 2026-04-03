import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type {
  ChatState,
  ConversationMessage,
  ConversationSummary,
} from "@/src/types/chat";

const initialState: ChatState = {
  conversations: [],
  conversationsStatus: "idle",
  conversationsError: null,
  activeConversationId: null,
  composerText: "",
  sendingStatus: "idle",
  sendingError: null,
  isAssistantTyping: false,
  messagesByConversationId: {},
  messagesStatusByConversationId: {},
  messagesErrorByConversationId: {},
  composerPlaceholderText: "Message sending will be implemented next.",
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    conversationsLoading(state) {
      state.conversationsStatus = "loading";
      state.conversationsError = null;
    },
    conversationsReceived(state, action: PayloadAction<ConversationSummary[]>) {
      state.conversations = action.payload;
      state.conversationsStatus = "succeeded";
      state.conversationsError = null;

      const activeConversationStillExists = state.conversations.some(
        (conversation) => conversation.id === state.activeConversationId,
      );

      if (!activeConversationStillExists) {
        state.activeConversationId = null;
      }
    },
    conversationsFailed(state, action: PayloadAction<string>) {
      state.conversationsStatus = "failed";
      state.conversationsError = action.payload;
    },
    setActiveConversation(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload;
      state.sendingError = null;
      state.isAssistantTyping = false;
      state.sendingStatus = "idle";
    },
    startNewConversationDraft(state) {
      state.activeConversationId = null;
      state.composerText = "";
      state.sendingStatus = "idle";
      state.sendingError = null;
      state.isAssistantTyping = false;
    },
    setComposerText(state, action: PayloadAction<string>) {
      state.composerText = action.payload;
    },
    appendComposerText(state, action: PayloadAction<string>) {
      const text = action.payload;
      const current = state.composerText;
      const separator = current && !current.endsWith(" ") ? " " : "";
      state.composerText = current + separator + text;
    },
    sendingStarted(
      state,
      action: PayloadAction<{ conversationId: string | null; messageText: string }>,
    ) {
      state.sendingStatus = "loading";
      state.sendingError = null;
      state.isAssistantTyping = true;
      state.composerText = "";

      // Optimistic UI: show the user message immediately
      const convId = action.payload.conversationId ?? "__pending__";
      if (!state.messagesByConversationId[convId]) {
        state.messagesByConversationId[convId] = [];
      }
      state.messagesByConversationId[convId].push({
        id: `optimistic-${Date.now()}`,
        role: "user",
        text: action.payload.messageText,
        createdAtMs: Date.now(),
      });
    },
    sendingSucceeded(state) {
      state.sendingStatus = "idle";
      state.sendingError = null;
      state.isAssistantTyping = false;
    },
    sendingFailed(state, action: PayloadAction<string>) {
      state.sendingStatus = "idle";
      state.sendingError = action.payload;
      state.isAssistantTyping = false;
    },
    clearSendingState(state) {
      state.sendingStatus = "idle";
      state.sendingError = null;
      state.isAssistantTyping = false;
    },
    messagesLoading(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      state.messagesStatusByConversationId[conversationId] = "loading";
      state.messagesErrorByConversationId[conversationId] = null;
    },
    messagesReceived(
      state,
      action: PayloadAction<{
        conversationId: string;
        messages: ConversationMessage[];
      }>,
    ) {
      const { conversationId, messages } = action.payload;
      state.messagesByConversationId[conversationId] = messages;
      state.messagesStatusByConversationId[conversationId] = "succeeded";
      state.messagesErrorByConversationId[conversationId] = null;
    },
    messagesFailed(
      state,
      action: PayloadAction<{ conversationId: string; error: string }>,
    ) {
      const { conversationId, error } = action.payload;
      state.messagesStatusByConversationId[conversationId] = "failed";
      state.messagesErrorByConversationId[conversationId] = error;
    },
    streamingChunkReceived(
      state,
      action: PayloadAction<{
        conversationId: string;
        text: string;
      }>,
    ) {
      const { conversationId, text } = action.payload;
      if (!state.messagesByConversationId[conversationId]) {
        state.messagesByConversationId[conversationId] = [];
      }

      const messages = state.messagesByConversationId[conversationId];
      const lastMessage = messages[messages.length - 1];

      // Append to existing streaming message or create a new one
      if (lastMessage && lastMessage.id.startsWith("streaming-")) {
        lastMessage.text += text;
      } else {
        messages.push({
          id: `streaming-${Date.now()}`,
          role: "system",
          text,
          createdAtMs: Date.now(),
        });
      }
    },
    resetChat() {
      return initialState;
    },
  },
});

export const {
  appendComposerText,
  clearSendingState,
  conversationsFailed,
  conversationsLoading,
  conversationsReceived,
  messagesFailed,
  messagesLoading,
  messagesReceived,
  resetChat,
  sendingFailed,
  sendingStarted,
  sendingSucceeded,
  setComposerText,
  setActiveConversation,
  startNewConversationDraft,
  streamingChunkReceived,
} = chatSlice.actions;

export default chatSlice.reducer;
