import { auth } from "@/src/lib/firebase";

export type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export type SendChatApiRequest = {
  conversationId: string | null;
  message: string;
  userLocation?: UserLocation | null;
};

export type SendChatApiResponse = {
  conversationId: string;
  responseMessage: {
    id: string;
    role: "system";
    text: string;
  };
};

type ApiErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

type ApiSuccessBody = {
  data?: unknown;
};

export class ChatApiServiceError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ChatApiServiceError";
    this.code = code;
    this.status = status;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseSuccessData(data: unknown): SendChatApiResponse {
  if (typeof data !== "object" || data === null) {
    throw new ChatApiServiceError(
      "Invalid chat API response payload.",
      "INVALID_RESPONSE",
      502,
    );
  }

  const payload = data as Record<string, unknown>;
  const conversationId = payload.conversationId;
  const responseMessage = payload.responseMessage;

  if (!isNonEmptyString(conversationId)) {
    throw new ChatApiServiceError(
      "Chat API response is missing conversationId.",
      "INVALID_RESPONSE",
      502,
    );
  }

  if (typeof responseMessage !== "object" || responseMessage === null) {
    throw new ChatApiServiceError(
      "Chat API response is missing responseMessage.",
      "INVALID_RESPONSE",
      502,
    );
  }

  const parsedMessage = responseMessage as Record<string, unknown>;
  const id = parsedMessage.id;
  const role = parsedMessage.role;
  const text = parsedMessage.text;

  if (!isNonEmptyString(id) || role !== "system" || typeof text !== "string") {
    throw new ChatApiServiceError(
      "Chat API response has invalid responseMessage shape.",
      "INVALID_RESPONSE",
      502,
    );
  }

  return {
    conversationId,
    responseMessage: {
      id,
      role,
      text,
    },
  };
}

export async function sendMessageToServer(
  payload: SendChatApiRequest,
): Promise<SendChatApiResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new ChatApiServiceError(
      "User is not authenticated.",
      "UNAUTHORIZED",
      401,
    );
  }

  const idToken = await user.getIdToken();

  const response = await fetch("/api/backend/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;

    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }

    const code =
      typeof body?.error?.code === "string"
        ? body.error.code
        : "CHAT_API_ERROR";
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : `Chat API failed with status ${response.status}.`;

    throw new ChatApiServiceError(message, code, response.status);
  }

  let body: ApiSuccessBody;

  try {
    body = (await response.json()) as ApiSuccessBody;
  } catch {
    throw new ChatApiServiceError(
      "Chat API returned invalid JSON.",
      "INVALID_RESPONSE",
      502,
    );
  }

  return parseSuccessData(body.data);
}
