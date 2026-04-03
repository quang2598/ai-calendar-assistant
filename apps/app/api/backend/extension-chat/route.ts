import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/src/lib/firebaseAdmin";
import {
  BackendChatError,
  processBackendChatRequest,
  toBackendChatError,
  type BackendChatRequest,
} from "@/src/server/chat";

export const runtime = "nodejs";

const EXTENSION_CONVERSATION_ID = "extension-conversation";

type UserLocation = {
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
};

type ChatRequestBody = {
  conversationId?: unknown;
  message?: unknown;
  userLocation?: unknown;
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

function parseBody(body: ChatRequestBody) {
  const message = typeof body.message === "string" ? body.message : "";

  // Parse userLocation if provided
  let userLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null = null;
  if (body.userLocation && typeof body.userLocation === "object") {
    const loc = body.userLocation as Record<string, unknown>;
    if (
      typeof loc.latitude === "number" &&
      typeof loc.longitude === "number" &&
      loc.latitude >= -90 &&
      loc.latitude <= 90 &&
      loc.longitude >= -180 &&
      loc.longitude <= 180
    ) {
      userLocation = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: typeof loc.accuracy === "number" ? loc.accuracy : undefined,
      };
    }
  }

  return {
    message,
    userLocation,
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
    const idToken = parseBearerToken(request);
    const decoded = await verifyFirebaseIdToken(idToken);
    const parsedBody = parseBody(body);

    const payload: BackendChatRequest = {
      conversationId: EXTENSION_CONVERSATION_ID,
      message: parsedBody.message,
      userLocation: parsedBody.userLocation,
    };
    const data = await processBackendChatRequest(payload, idToken, decoded.uid);

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
