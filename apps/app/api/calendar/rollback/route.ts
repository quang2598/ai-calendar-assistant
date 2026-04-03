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

interface RollbackRequest {
  actionId: string;
  eventId: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const firebaseIdToken = parseBearerToken(request);
    const decoded = await verifyFirebaseIdToken(firebaseIdToken);
    const uid = decoded.uid;

    const body = (await request.json()) as RollbackRequest;
    const { actionId, eventId } = body;

    if (!actionId || !eventId) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_PARAMS",
            message: "actionId and eventId are required.",
          },
        },
        { status: 400 },
      );
    }

    // Get the action history record
    const actionRef = adminDb
      .collection("users")
      .doc(uid)
      .collection("action-history")
      .doc(actionId);

    const actionSnapshot = await actionRef.get();

    if (!actionSnapshot.exists) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Action not found." } },
        { status: 404 },
      );
    }

    const actionData = actionSnapshot.data();

    // Check if already rolled back
    if (actionData?.alreadyRolledBack) {
      return NextResponse.json(
        {
          error: {
            code: "ALREADY_ROLLED_BACK",
            message: "This action has already been rolled back.",
          },
        },
        { status: 400 },
      );
    }

    // Check if action is within 1 hour
    const createdAt =
      actionData?.createdAt?.toDate?.() ?? actionData?.createdAt;
    if (createdAt) {
      const createdDate =
        typeof createdAt === "string" ? new Date(createdAt) : createdAt;
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      if (createdDate < hourAgo) {
        return NextResponse.json(
          {
            error: {
              code: "ROLLBACK_TIME_EXPIRED",
              message:
                "Can only rollback actions created within the last 1 hour.",
            },
          },
          { status: 400 },
        );
      }
    }

    // Check if this is the latest action (most recent by createdAt)
    const latestActionSnapshot = await adminDb
      .collection("users")
      .doc(uid)
      .collection("action-history")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (latestActionSnapshot.empty) {
      return NextResponse.json(
        { error: { code: "NO_ACTIONS", message: "No actions found." } },
        { status: 404 },
      );
    }

    const latestAction = latestActionSnapshot.docs[0];
    if (latestAction.id !== actionId) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_LATEST_ACTION",
            message: "Can only rollback the most recent action.",
          },
        },
        { status: 400 },
      );
    }

    // Get the agent-created event record to check snapshots
    const eventRef = adminDb
      .collection("users")
      .doc(uid)
      .collection("event-managed-by-agent")
      .doc(eventId);

    const eventSnapshot = await eventRef.get();
    const eventData = eventSnapshot.data();

    if (!eventData) {
      return NextResponse.json(
        {
          error: {
            code: "EVENT_NOT_FOUND",
            message: "Event not found in agent-created events.",
          },
        },
        { status: 404 },
      );
    }

    // Determine rollback case and validate
    const currentSnapshot = eventData.snapshot;
    const previousSnapshot = eventData.previousSnapshot;
    const actionType = actionData?.actionType;

    let rollbackCase: "delete" | "restore" | "update" = "update";

    // Case 1: Event just created (no previous_snapshot) - delete it
    if (previousSnapshot === null || previousSnapshot === undefined) {
      rollbackCase = "delete";

      // Verify action type is "add"
      if (actionType !== "add") {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATE",
              message: `Cannot delete event for ${actionType} action when there's no previous snapshot.`,
            },
          },
          { status: 400 },
        );
      }
    }
    // Case 2: Event was deleted (current_snapshot is null) - restore it
    else if (currentSnapshot === null || currentSnapshot === undefined) {
      rollbackCase = "restore";

      // Verify action type is "delete"
      if (actionType !== "delete") {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATE",
              message: `Cannot restore event for ${actionType} action when there's no current snapshot.`,
            },
          },
          { status: 400 },
        );
      }
    }
    // Case 3: Event was modified (both snapshots exist) - update to previous
    else {
      rollbackCase = "update";

      // Verify action type is "update"
      if (actionType !== "update") {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATE",
              message: `Cannot update event for ${actionType} action when both snapshots exist.`,
            },
          },
          { status: 400 },
        );
      }
    }

    // Call the agent's rollback endpoint to perform the actual rollback
    // Pass the Firebase ID token for agent authentication
    const agentBaseUrl = process.env.AGENT_API_URL || "http://localhost:8000";

    const rollbackResponse = await fetch(`${agentBaseUrl}/agent/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`,
      },
      body: JSON.stringify({
        uid,
        event_id: eventId,
        calendar_id: "primary",
      }),
    });

    if (!rollbackResponse.ok) {
      let errorMessage = "Failed to rollback event.";
      try {
        const errorData = await rollbackResponse.json();
        if (errorData?.detail?.message) {
          errorMessage = errorData.detail.message;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // If response is not JSON, use default message
      }

      return NextResponse.json(
        {
          error: {
            code: "ROLLBACK_FAILED",
            message: errorMessage,
          },
        },
        { status: 500 },
      );
    }

    const rollbackResult = await rollbackResponse.json();

    // Update the action history in UI to reflect the rollback
    // Note: alreadyRolledBack was already set above before calling the agent
    return NextResponse.json({
      success: true,
      message: rollbackResult.message,
      rollbackCase: undefined, // Determined by agent
      event: rollbackResult.event,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to rollback action.";

    return NextResponse.json(
      { error: { code: "ROLLBACK_ERROR", message } },
      { status: 500 },
    );
  }
}
