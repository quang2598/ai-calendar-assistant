export type AgentChatRequest = {
  uid: string;
  conversationId: string;
  message: string;
};

export type AgentChatResponse = {
  responseMessage: {
    text: string;
  };
};

type AgentChatErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

const DEFAULT_AGENT_CHAT_URL = "http://localhost:8082/agent/send-chat";

export class AgentChatServiceError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AgentChatServiceError";
    this.code = code;
    this.status = status;
  }
}

function getAgentChatUrl(): string {
  const configuredUrl = process.env.AGENT_CHAT_URL?.trim();
  return configuredUrl || DEFAULT_AGENT_CHAT_URL;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseAgentChatResponse(data: unknown): AgentChatResponse {
  if (typeof data !== "object" || data === null) {
    throw new AgentChatServiceError(
      "Invalid agent chat response payload.",
      "INVALID_AGENT_RESPONSE",
      502,
    );
  }

  const payload = data as Record<string, unknown>;
  const responseMessage = payload.responseMessage;
  if (typeof responseMessage !== "object" || responseMessage === null) {
    throw new AgentChatServiceError(
      "Agent chat response is missing responseMessage.",
      "INVALID_AGENT_RESPONSE",
      502,
    );
  }

  const parsedMessage = responseMessage as Record<string, unknown>;
  const text = parsedMessage.text;
  if (!isNonEmptyString(text)) {
    throw new AgentChatServiceError(
      "Agent chat response is missing responseMessage.text.",
      "INVALID_AGENT_RESPONSE",
      502,
    );
  }

  return {
    responseMessage: {
      text,
    },
  };
}

export async function requestAgentChatResponse(
  payload: AgentChatRequest,
): Promise<AgentChatResponse> {
  const response = await fetch(getAgentChatUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let body: AgentChatErrorBody | null = null;

    try {
      body = (await response.json()) as AgentChatErrorBody;
    } catch {
      body = null;
    }

    const code =
      typeof body?.error?.code === "string" ? body.error.code : "AGENT_CHAT_REQUEST_FAILED";
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : `Agent chat request failed with status ${response.status}.`;

    throw new AgentChatServiceError(message, code, response.status);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new AgentChatServiceError(
      "Agent chat service returned invalid JSON.",
      "INVALID_AGENT_RESPONSE",
      502,
    );
  }

  return parseAgentChatResponse(body);
}
