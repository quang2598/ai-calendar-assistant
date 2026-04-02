import {
  Timestamp,
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import type {
  ConversationMessage,
  ConversationSummary,
  ChatMessageRole,
} from "@/src/types/chat";

type ConversationListener = (conversations: ConversationSummary[]) => void;
type MessageListener = (messages: ConversationMessage[]) => void;
type ListenerErrorHandler = (error: unknown) => void;

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return 0;
}

function toMessageRole(value: unknown): ChatMessageRole {
  return value === "system" ? "system" : "user";
}

export function listenToConversations(
  uid: string,
  onData: ConversationListener,
  onError?: ListenerErrorHandler,
): () => void {
  const conversationsRef = collection(db, "users", uid, "conversations");
  const conversationsQuery = query(
    conversationsRef,
    orderBy("lastUpdated", "desc"),
  );

  return onSnapshot(
    conversationsQuery,
    (snapshot) => {
      const conversations = snapshot.docs.map((doc) => {
        const data = doc.data();
        let title = "Untitled chat";

        // Special handling for extension conversation
        if (doc.id === "extension-conversation") {
          title = "Extension conversation";
        } else if (typeof data.title === "string" && data.title.trim()) {
          title = data.title;
        }

        return {
          id: doc.id,
          title: title,
          createdAtMs: toMillis(data.createdAt),
          lastUpdatedMs: toMillis(data.lastUpdated),
        } satisfies ConversationSummary;
      });

      onData(conversations);
    },
    onError,
  );
}

export function listenToMessages(
  uid: string,
  conversationId: string,
  onData: MessageListener,
  onError?: ListenerErrorHandler,
): () => void {
  const messagesRef = collection(
    db,
    "users",
    uid,
    "conversations",
    conversationId,
    "messages",
  );
  const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"));

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((doc) => {
        const data = doc.data();

        return {
          id: doc.id,
          role: toMessageRole(data.role),
          text: typeof data.text === "string" ? data.text : "",
          createdAtMs: toMillis(data.createdAt),
        } satisfies ConversationMessage;
      });

      onData(messages);
    },
    onError,
  );
}
