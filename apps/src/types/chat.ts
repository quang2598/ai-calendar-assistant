export type ChatMessageRole = "system" | "user";

export type ConversationSummary = {
  id: string;
  title: string;
  createdAtMs: number;
  lastUpdatedMs: number;
};

export type ConversationMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
  correctedText?: string; // AI's interpretation of the message (if different from text)
  createdAtMs: number;
};

export type AsyncStatus = "idle" | "loading" | "succeeded" | "failed";

export type ChatState = {
  conversations: ConversationSummary[];
  conversationsStatus: AsyncStatus;
  conversationsError: string | null;
  activeConversationId: string | null;
  composerText: string;
  sendingStatus: AsyncStatus;
  sendingError: string | null;
  isAssistantTyping: boolean;
  messagesByConversationId: Record<string, ConversationMessage[]>;
  messagesStatusByConversationId: Record<string, AsyncStatus>;
  messagesErrorByConversationId: Record<string, string | null>;
  composerPlaceholderText: string;
};
