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

/**
 * Get a fresh ID token from Firebase, forcing refresh if needed
 */
async function getFreshIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new ChatApiServiceError(
      "User is not authenticated.",
      "UNAUTHORIZED",
      401,
    );
  }

  // Force refresh the token to ensure we get a fresh one
  return await user.getIdToken(true);
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

  // Get a fresh ID token with force refresh
  const idToken = await getFreshIdToken();

  const response = await fetch("/api/backend/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  // If we get a 401, try once more with a fresh token
  if (response.status === 401) {
    const freshToken = await getFreshIdToken();
    const retryResponse = await fetch("/api/backend/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${freshToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!retryResponse.ok) {
      let body: ApiErrorBody | null = null;

      try {
        body = (await retryResponse.json()) as ApiErrorBody;
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
          : `Chat API failed with status ${retryResponse.status}.`;

      throw new ChatApiServiceError(message, code, retryResponse.status);
    }

    let body: ApiSuccessBody;

    try {
      body = (await retryResponse.json()) as ApiSuccessBody;
    } catch {
      throw new ChatApiServiceError(
        "Chat API returned invalid JSON.",
        "INVALID_RESPONSE",
        502,
      );
    }

    return parseSuccessData(body.data);
  }

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

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "done"; conversationId: string; messageId: string };

export async function sendMessageToServerStream(
  payload: SendChatApiRequest,
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new ChatApiServiceError(
      "User is not authenticated.",
      "UNAUTHORIZED",
      401,
    );
  }

  // Get a fresh ID token with force refresh
  let idToken = await getFreshIdToken();

  let response = await fetch("/api/backend/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      "X-Stream": "true",
    },
    body: JSON.stringify(payload),
  });

  // If we get a 401, try once more with a fresh token
  if (response.status === 401) {
    idToken = await getFreshIdToken();
    response = await fetch("/api/backend/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "X-Stream": "true",
      },
      body: JSON.stringify(payload),
    });
  }

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
        : `Chat API stream failed with status ${response.status}.`;

    throw new ChatApiServiceError(message, code, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ChatApiServiceError(
      "Stream response has no body.",
      "INVALID_RESPONSE",
      502,
    );
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]" || !data) continue;

      try {
        const parsed = JSON.parse(data) as {
          text?: string;
          done?: boolean;
          conversationId?: string;
          messageId?: string;
        };

        if (parsed.done && parsed.conversationId) {
          onChunk({
            type: "done",
            conversationId: parsed.conversationId,
            messageId: parsed.messageId ?? "",
          });
        } else if (parsed.text) {
          onChunk({ type: "text", text: parsed.text });
        }
      } catch {
        // Skip malformed SSE events
      }
    }
  }
}
