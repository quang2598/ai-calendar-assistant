import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/src/lib/firebaseAdmin";
import { adminDb } from "@/src/lib/firebaseAdmin";

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

    // Fetch action history from Firestore sub-collection
    const actionHistoryRef = adminDb
      .collection("users")
      .doc(decoded.uid)
      .collection("action-history")
      .orderBy("createdAt", "desc");

    const snapshot = await actionHistoryRef.get();

    const actionHistory = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        actionType: data.actionType,
        alreadyRolledBack: data.alreadyRolledBack ?? false,
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
        eventId: data.eventId,
        eventTitle: data.eventTitle,
        description: data.description,
      };
    });

    return NextResponse.json({ actionHistory }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch action history.";

    return NextResponse.json(
      { error: { code: "ACTION_HISTORY_FAILED", message } },
      { status: 500 },
    );
  }
}
