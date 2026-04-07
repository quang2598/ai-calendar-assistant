import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/src/lib/firebaseAdmin";
import { initializeExtensionAuthProfile } from "@/src/server/extension/extensionAuthProfileService";

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const firebaseIdToken = parseBearerToken(request);
    const decoded = await verifyFirebaseIdToken(firebaseIdToken);
    const profile = await initializeExtensionAuthProfile(decoded.uid);

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to initialize extension auth profile.";

    return NextResponse.json(
      {
        error: {
          code: "EXTENSION_AUTH_PROFILE_FAILED",
          message,
        },
      },
      { status: 401 },
    );
  }
}
