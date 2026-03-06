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
    resetChat() {
      return initialState;
    },
  },
});

export const {
  conversationsFailed,
  conversationsLoading,
  conversationsReceived,
  messagesFailed,
  messagesLoading,
  messagesReceived,
  resetChat,
  setActiveConversation,
} = chatSlice.actions;

export default chatSlice.reducer;
