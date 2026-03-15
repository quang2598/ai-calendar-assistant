import { NextRequest, NextResponse } from "next/server";

import {
  BackendChatError,
  processBackendChatRequest,
  toBackendChatError,
  type BackendChatRequest,
} from "@/src/server/chat";

export const runtime = "nodejs";

type ChatRequestBody = {
  uid?: unknown;
  conversationId?: unknown;
  message?: unknown;
};

function errorResponse(error: unknown): NextResponse {
  const normalized = toBackendChatError(error);

  return NextResponse.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    },
    { status: normalized.status },
  );
}

async function parseJsonBody(request: NextRequest): Promise<ChatRequestBody> {
  try {
    return (await request.json()) as ChatRequestBody;
  } catch {
    throw new BackendChatError("Invalid JSON body.", "INVALID_JSON", 400);
  }
}

function parseBody(body: ChatRequestBody): BackendChatRequest {
  const uid = typeof body.uid === "string" ? body.uid : "";
  const message = typeof body.message === "string" ? body.message : "";

  let conversationId: string | null;
  if (body.conversationId === null || typeof body.conversationId === "undefined") {
    conversationId = null;
  } else if (typeof body.conversationId === "string") {
    conversationId = body.conversationId;
  } else {
    throw new BackendChatError(
      "conversationId must be a string or null.",
      "INVALID_CONVERSATION_ID",
      400,
    );
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
    throw new BackendChatError(
      "Missing Authorization bearer token.",
      "UNAUTHORIZED",
      401,
    );
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new BackendChatError("Invalid bearer token.", "UNAUTHORIZED", 401);
  }

  return token;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await parseJsonBody(request);
    const payload = parseBody(body);
    const idToken = parseBearerToken(request);
    const data = await processBackendChatRequest(payload, idToken);

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
