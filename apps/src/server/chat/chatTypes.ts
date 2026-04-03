export type BackendAuthContext = {
  uid: string;
};

export type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export type BackendChatRequest = {
  conversationId: string | null;
  message: string;
  userLocation?: UserLocation | null;
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
