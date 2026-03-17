export type MockAuthContext = {
  uid: string;
};

export type MockChatRequest = {
  uid: string;
  conversationId: string | null;
  message: string;
};

export type MockMessageResponse = {
  id: string;
  role: "system";
  text: string;
};

export type MockChatResponse = {
  conversationId: string;
  responseMessage: MockMessageResponse;
};
