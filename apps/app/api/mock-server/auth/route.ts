import { NextRequest, NextResponse } from "next/server";

import {
  MockServerError,
  getAuthContextByUid,
  toMockServerError,
} from "@/src/mock-server";

export const runtime = "nodejs";

type AuthRequestBody = {
  uid?: unknown;
};

function getUid(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorResponse(error: unknown): NextResponse {
  const normalized = toMockServerError(error);

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

async function parseBody(request: NextRequest): Promise<AuthRequestBody> {
  try {
    return (await request.json()) as AuthRequestBody;
  } catch {
    throw new MockServerError("Invalid JSON body.", "INVALID_JSON", 400);
  }
}

export async function GET(request: NextRequest) {
  try {
    const uid = request.nextUrl.searchParams.get("uid") ?? "";
    const auth = getAuthContextByUid(uid);

    return NextResponse.json({ auth }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request);
    const auth = getAuthContextByUid(getUid(body.uid));

    return NextResponse.json({ auth }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
