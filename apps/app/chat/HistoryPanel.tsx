"use client";

import { useEffect, useState } from "react";
import type { ActionHistoryRecord } from "@/src/types/actionHistory";

type HistoryPanelProps = {
  uid: string | null;
  idToken: string | null;
};

const ROLLBACK_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export default function HistoryPanel({ uid, idToken }: HistoryPanelProps) {
  const [actionHistory, setActionHistory] = useState<ActionHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);
  const [expandedDescriptionId, setExpandedDescriptionId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!uid || !idToken) return;

    const fetchActionHistory = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/calendar/history", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error?.message || "Failed to fetch action history",
          );
        }

        const data = await response.json();
        setActionHistory(data.actionHistory || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchActionHistory();
  }, [uid, idToken]);

  const isActionEligibleForRollback = (
    action: ActionHistoryRecord,
    isLatest: boolean,
  ): boolean => {
    // Must be latest action
    if (!isLatest) return false;

    // Cannot rollback if already rolled back
    if (action.alreadyRolledBack) return false;

    // Must be within 1 hour
    const createdAt =
      typeof action.createdAt === "string"
        ? new Date(action.createdAt)
        : action.createdAt;
    const now = new Date();
    const isWithinOneHour =
      now.getTime() - createdAt.getTime() < ROLLBACK_WINDOW_MS;

    return isWithinOneHour;
  };

  const getRollbackDisabledReason = (
    action: ActionHistoryRecord,
    isLatest: boolean,
  ): string | null => {
    if (action.alreadyRolledBack) {
      return "Already rolled back";
    }

    const createdAt =
      typeof action.createdAt === "string"
        ? new Date(action.createdAt)
        : action.createdAt;
    const now = new Date();
    const isWithinOneHour =
      now.getTime() - createdAt.getTime() < ROLLBACK_WINDOW_MS;

    if (!isWithinOneHour) {
      return "Expired (>1 hour)";
    }

    if (!isLatest) {
      return "Not latest action";
    }

    return null;
  };

  const handleRollback = async (actionId: string, eventId: string) => {
    if (!idToken) return;

    try {
      setRollingBackId(actionId);
      setRollbackMessage(null);

      const response = await fetch("/api/calendar/rollback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          actionId,
          eventId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || "Failed to rollback action",
        );
      }

      const data = await response.json();
      setRollbackMessage(data.message);

      // Update the action history to mark as rolled back
      setActionHistory((prev) =>
        prev.map((action) =>
          action.id === actionId
            ? { ...action, alreadyRolledBack: true }
            : action,
        ),
      );

      // Clear success message after 3 seconds
      setTimeout(() => setRollbackMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollingBackId(null);
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case "add":
        return "text-green-400";
      case "update":
        return "text-blue-400";
      case "delete":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  const getActionLabel = (actionType: string) => {
    switch (actionType) {
      case "add":
        return "Created";
      case "update":
        return "Updated";
      case "delete":
        return "Deleted";
      default:
        return actionType;
    }
  };

  const formatDate = (date: string | Date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      <div className="px-4 py-4 border-b border-slate-800">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
          History
        </p>
        <h2 className="text-lg font-semibold text-slate-100">Action History</h2>
      </div>

      {rollbackMessage && (
        <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/30 text-sm text-green-300">
          {rollbackMessage}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4">
            <p className="text-sm text-slate-400">Loading history...</p>
          </div>
        ) : error ? (
          <div className="p-4">
            <p className="text-sm text-red-400">Error: {error}</p>
          </div>
        ) : actionHistory.length === 0 ? (
          <div className="p-4">
            <p className="text-sm text-slate-400">No action history yet.</p>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {actionHistory.map((action, index) => {
              const isLatest = index === 0;
              const isEligible = isActionEligibleForRollback(action, isLatest);
              const disabledReason = getRollbackDisabledReason(
                action,
                isLatest,
              );

              return (
                <div
                  key={action.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-semibold uppercase ${getActionColor(action.actionType)}`}
                    >
                      {getActionLabel(action.actionType)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRollback(action.id, action.eventId)}
                      disabled={!isEligible || rollingBackId === action.id}
                      title={
                        isEligible
                          ? "Undo this action"
                          : disabledReason || "Cannot undo this action"
                      }
                      className={`shrink-0 px-2 py-1 rounded text-xs font-medium transition ${
                        !isEligible
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : rollingBackId === action.id
                            ? "bg-cyan-500/20 text-cyan-300 animate-pulse"
                            : "bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                      }`}
                    >
                      {rollingBackId === action.id ? "Rolling back..." : "Undo"}
                    </button>
                    {!isEligible && disabledReason && (
                      <span className="text-xs text-slate-500 shrink-0">
                        {disabledReason}
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-slate-100 mb-1 truncate">
                    {action.eventTitle}
                  </p>

                  {action.description && (
                    <div className="mb-2">
                      <p
                        className={`text-xs text-slate-400 ${expandedDescriptionId === action.id ? "" : "line-clamp-2"}`}
                      >
                        {action.description}
                      </p>
                      {action.description.length > 80 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDescriptionId(
                              expandedDescriptionId === action.id
                                ? null
                                : action.id,
                            )
                          }
                          className="mt-1 text-xs text-cyan-400 hover:text-cyan-300 transition"
                        >
                          {expandedDescriptionId === action.id
                            ? "Show less"
                            : "Show more"}
                        </button>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-slate-500">
                    {formatDate(action.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
