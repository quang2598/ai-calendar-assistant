export type BackendAuthContext = {
  uid: string;
};

export type BackendChatRequest = {
  uid: string;
  conversationId: string | null;
  message: string;
};

export type BackendMessageResponse = {
  id: string;
  role: "system";
  text: string;
};

export type BackendChatResponse = {
  conversationId: string;
  responseMessage: BackendMessageResponse;
};
