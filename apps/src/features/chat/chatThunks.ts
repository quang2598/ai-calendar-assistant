import { createAsyncThunk } from "@reduxjs/toolkit";
import { FirestoreError } from "firebase/firestore";

import { getCurrentAuthUid } from "@/src/services/auth/firebaseAuthService";
import {
  listenToConversations,
  listenToMessages,
} from "@/src/services/chat/firestoreChatService";
import {
  ChatApiServiceError,
  sendMessageToServer,
} from "@/src/services/chat/chatApiService";
import type { RootState } from "@/src/store";

import {
  conversationsFailed,
  conversationsLoading,
  conversationsReceived,
  messagesFailed,
  messagesLoading,
  messagesReceived,
  sendingFailed,
  sendingStarted,
  sendingSucceeded,
  setActiveConversation,
} from "./chatSlice";

let conversationsUnsubscribe: (() => void) | null = null;
let conversationsListeningUid: string | null = null;
let conversationsListenerToken = 0;

let messagesUnsubscribe: (() => void) | null = null;
let messagesListeningUid: string | null = null;
let messagesListeningConversationId: string | null = null;
let messagesListenerToken = 0;

function normalizeFirestoreError(error: unknown): string {
  if (error instanceof FirestoreError) {
    return error.code;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected Firestore error occurred.";
}

function normalizeChatApiError(error: unknown): string {
  if (error instanceof ChatApiServiceError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected chat API error occurred.";
}

function teardownConversationsListener() {
  if (conversationsUnsubscribe) {
    conversationsUnsubscribe();
    conversationsUnsubscribe = null;
  }
  conversationsListeningUid = null;
  conversationsListenerToken += 1;
}

function teardownMessagesListener() {
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
  messagesListeningUid = null;
  messagesListeningConversationId = null;
  messagesListenerToken += 1;
}

export const startConversationsListener = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>("chat/startConversationsListener", async (_, { dispatch, rejectWithValue }) => {
  const uid = getCurrentAuthUid();
  if (!uid) {
    const message = "User is not authenticated.";
    dispatch(conversationsFailed(message));
    return rejectWithValue(message);
  }

  if (conversationsUnsubscribe && conversationsListeningUid === uid) {
    return;
  }

  teardownConversationsListener();
  conversationsListeningUid = uid;
  const listenerToken = conversationsListenerToken;
  dispatch(conversationsLoading());

  try {
    conversationsUnsubscribe = listenToConversations(
      uid,
      (conversations) => {
        if (listenerToken !== conversationsListenerToken) {
          return;
        }
        dispatch(conversationsReceived(conversations));
      },
      (error) => {
        if (listenerToken !== conversationsListenerToken) {
          return;
        }
        dispatch(conversationsFailed(normalizeFirestoreError(error)));
      },
    );
  } catch (error) {
    teardownConversationsListener();
    const message = normalizeFirestoreError(error);
    dispatch(conversationsFailed(message));
    return rejectWithValue(message);
  }
});

export const startMessagesListener = createAsyncThunk<
  void,
  { conversationId: string },
  { rejectValue: string }
>(
  "chat/startMessagesListener",
  async ({ conversationId }, { dispatch, rejectWithValue }) => {
    const uid = getCurrentAuthUid();
    if (!uid) {
      const message = "User is not authenticated.";
      dispatch(messagesFailed({ conversationId, error: message }));
      return rejectWithValue(message);
    }

    if (
      messagesUnsubscribe &&
      messagesListeningUid === uid &&
      messagesListeningConversationId === conversationId
    ) {
      return;
    }

    teardownMessagesListener();
    messagesListeningUid = uid;
    messagesListeningConversationId = conversationId;
    const listenerToken = messagesListenerToken;
    dispatch(messagesLoading(conversationId));

    try {
      messagesUnsubscribe = listenToMessages(
        uid,
        conversationId,
        (messages) => {
          if (listenerToken !== messagesListenerToken) {
            return;
          }
          dispatch(messagesReceived({ conversationId, messages }));
        },
        (error) => {
          if (listenerToken !== messagesListenerToken) {
            return;
          }
          dispatch(
            messagesFailed({
              conversationId,
              error: normalizeFirestoreError(error),
            }),
          );
        },
      );
    } catch (error) {
      teardownMessagesListener();
      const message = normalizeFirestoreError(error);
      dispatch(messagesFailed({ conversationId, error: message }));
      return rejectWithValue(message);
    }
  },
);

export const stopChatListeners = createAsyncThunk(
  "chat/stopChatListeners",
  async () => {
    teardownConversationsListener();
    teardownMessagesListener();
  },
);

export const stopMessagesListener = createAsyncThunk(
  "chat/stopMessagesListener",
  async () => {
    teardownMessagesListener();
  },
);

export const sendComposerMessage = createAsyncThunk<
  void,
  void,
  { state: RootState; rejectValue: string }
>("chat/sendComposerMessage", async (_, { dispatch, getState, rejectWithValue }) => {
  const state = getState();
  if (state.chat.sendingStatus === "loading") {
    return;
  }

  const message = state.chat.composerText.trim();
  const conversationId = state.chat.activeConversationId;
  const uid = getCurrentAuthUid();

  if (!message) {
    const error = "Message cannot be empty.";
    dispatch(sendingFailed(error));
    return rejectWithValue(error);
  }

  if (!uid) {
    const error = "User is not authenticated.";
    dispatch(sendingFailed(error));
    return rejectWithValue(error);
  }

  dispatch(sendingStarted({ conversationId, messageText: message }));

  try {
    const data = await sendMessageToServer({
      conversationId,
      message,
    });

    const currentActiveConversationId = getState().chat.activeConversationId;
    if (currentActiveConversationId !== data.conversationId) {
      dispatch(setActiveConversation(data.conversationId));
    }

    await dispatch(
      startMessagesListener({
        conversationId: data.conversationId,
      }),
    );

    dispatch(sendingSucceeded());
  } catch (error) {
    const errorMessage = normalizeChatApiError(error);
    dispatch(sendingFailed(errorMessage));
    return rejectWithValue(errorMessage);
  }
});
