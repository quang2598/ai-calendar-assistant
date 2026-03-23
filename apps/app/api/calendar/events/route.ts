import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/src/lib/firebaseAdmin";
import { fetchCalendarEvents } from "@/src/services/integrations/googleCalendarApiService";

export const runtime = "nodejs";

function parseBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Missing Authorization bearer token.");
  }

  const idToken = authorization.slice("Bearer ".length).trim();
  if (!idToken) {
    throw new Error("Invalid Authorization bearer token.");
  }

  return idToken;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const firebaseIdToken = parseBearerToken(request);
    const decoded = await verifyFirebaseIdToken(firebaseIdToken);

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json(
        { error: { code: "MISSING_PARAMS", message: "start and end query parameters are required." } },
        { status: 400 },
      );
    }

    const events = await fetchCalendarEvents(decoded.uid, start, end);

    return NextResponse.json({ events }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch calendar events.";

    return NextResponse.json(
      { error: { code: "CALENDAR_EVENTS_FAILED", message } },
      { status: 500 },
    );
  }
}
