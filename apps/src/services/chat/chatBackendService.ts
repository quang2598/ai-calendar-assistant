export type SendChatRequest = {
  uid: string;
  conversationId: string | null;
  message: string;
};

export type SendChatResponse = {
  conversationId: string;
  responseMessage: {
    id: string;
    role: "system";
    text: string;
  };
};

type BackendErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

type BackendSuccessBody = {
  data?: unknown;
};

export class ChatBackendServiceError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ChatBackendServiceError";
    this.code = code;
    this.status = status;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveBackendUrl(origin: string): string {
  const configured = process.env.CHAT_BACKEND_URL?.trim();

  if (!configured) {
    return `${origin}/api/mock-server/chat`;
  }

  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured;
  }

  if (configured.startsWith("/")) {
    return `${origin}${configured}`;
  }

  return `${origin}/${configured}`;
}

function parseBackendResponse(data: unknown): SendChatResponse {
  if (typeof data !== "object" || data === null) {
    throw new ChatBackendServiceError(
      "Invalid backend response payload.",
      "INVALID_BACKEND_RESPONSE",
      502,
    );
  }

  const payload = data as Record<string, unknown>;
  const conversationId = payload.conversationId;
  const responseMessage = payload.responseMessage;

  if (!isNonEmptyString(conversationId)) {
    throw new ChatBackendServiceError(
      "Backend response missing conversationId.",
      "INVALID_BACKEND_RESPONSE",
      502,
    );
  }

  if (typeof responseMessage !== "object" || responseMessage === null) {
    throw new ChatBackendServiceError(
      "Backend response missing responseMessage.",
      "INVALID_BACKEND_RESPONSE",
      502,
    );
  }

  const parsedMessage = responseMessage as Record<string, unknown>;
  const id = parsedMessage.id;
  const role = parsedMessage.role;
  const text = parsedMessage.text;

  if (!isNonEmptyString(id) || role !== "system" || typeof text !== "string") {
    throw new ChatBackendServiceError(
      "Backend response has invalid responseMessage shape.",
      "INVALID_BACKEND_RESPONSE",
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

export async function sendMessageToChatBackend(params: {
  origin: string;
  payload: SendChatRequest;
  idToken: string;
}): Promise<SendChatResponse> {
  const { origin, payload, idToken } = params;
  const backendUrl = resolveBackendUrl(origin);

  if (!idToken.trim()) {
    throw new ChatBackendServiceError("Missing Firebase ID token.", "UNAUTHORIZED", 401);
  }

  const response = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let body: BackendErrorBody | null = null;

    try {
      body = (await response.json()) as BackendErrorBody;
    } catch {
      body = null;
    }

    const errorCode =
      typeof body?.error?.code === "string" ? body.error.code : "BACKEND_ERROR";
    const errorMessage =
      typeof body?.error?.message === "string"
        ? body.error.message
        : `Chat backend request failed with status ${response.status}.`;

    throw new ChatBackendServiceError(errorMessage, errorCode, response.status);
  }

  let body: BackendSuccessBody;

  try {
    body = (await response.json()) as BackendSuccessBody;
  } catch {
    throw new ChatBackendServiceError(
      "Chat backend returned invalid JSON.",
      "INVALID_BACKEND_RESPONSE",
      502,
    );
  }

  return parseBackendResponse(body.data);
}
