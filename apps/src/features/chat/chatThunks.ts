import { createAsyncThunk } from "@reduxjs/toolkit";
import { FirestoreError } from "firebase/firestore";

import {
  listenToConversations,
  listenToMessages,
} from "@/src/services/chat/firestoreChatService";

import {
  conversationsFailed,
  conversationsLoading,
  conversationsReceived,
  messagesFailed,
  messagesLoading,
  messagesReceived,
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
  string,
  { rejectValue: string }
>("chat/startConversationsListener", async (uid, { dispatch, rejectWithValue }) => {
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
  { uid: string; conversationId: string },
  { rejectValue: string }
>(
  "chat/startMessagesListener",
  async ({ uid, conversationId }, { dispatch, rejectWithValue }) => {
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
