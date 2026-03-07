import { NextRequest, NextResponse } from "next/server";

import {
  ChatBackendServiceError,
  sendMessageToChatBackend,
  type SendChatRequest,
} from "@/src/services/chat/chatBackendService";

export const runtime = "nodejs";

type SendRequestBody = {
  uid?: unknown;
  conversationId?: unknown;
  message?: unknown;
};

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ChatBackendServiceError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: {
          code: "CHAT_SEND_FAILED",
          message: error.message,
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "CHAT_SEND_FAILED",
        message: "Unexpected error while sending chat message.",
      },
    },
    { status: 500 },
  );
}

async function parseJsonBody(request: NextRequest): Promise<SendRequestBody> {
  try {
    return (await request.json()) as SendRequestBody;
  } catch {
    throw new ChatBackendServiceError("Invalid JSON body.", "INVALID_JSON", 400);
  }
}

function parsePayload(body: SendRequestBody): SendChatRequest {
  const uid = typeof body.uid === "string" ? body.uid : "";
  const message = typeof body.message === "string" ? body.message : "";

  let conversationId: string | null;
  if (body.conversationId === null || typeof body.conversationId === "undefined") {
    conversationId = null;
  } else if (typeof body.conversationId === "string") {
    conversationId = body.conversationId;
  } else {
    throw new ChatBackendServiceError(
      "conversationId must be a string or null.",
      "INVALID_CONVERSATION_ID",
      400,
    );
  }

  if (!uid.trim()) {
    throw new ChatBackendServiceError("uid is required.", "INVALID_UID", 400);
  }

  if (!message.trim()) {
    throw new ChatBackendServiceError("message is required.", "INVALID_MESSAGE", 400);
  }

  return {
    uid,
    conversationId,
    message,
  };
}

function parseBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new ChatBackendServiceError(
      "Missing Authorization bearer token.",
      "UNAUTHORIZED",
      401,
    );
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new ChatBackendServiceError("Invalid bearer token.", "UNAUTHORIZED", 401);
  }

  return token;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await parseJsonBody(request);
    const payload = parsePayload(body);
    const idToken = parseBearerToken(request);
    const data = await sendMessageToChatBackend({
      origin: request.nextUrl.origin,
      payload,
      idToken,
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
