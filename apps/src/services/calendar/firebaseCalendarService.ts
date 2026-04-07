/**
 * Calendar update notification via user document.
 * Backend updates user.lastCalendarUpdate timestamp, frontend listens for changes.
 * Uses existing user subcollection rules - no new permissions needed.
 */

import { doc, onSnapshot, Unsubscribe, Timestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export interface CalendarUpdateTrigger {
  lastCalendarUpdate: Timestamp;
  lastCalendarUpdateEventDate?: string; // ISO date like "2026-04-06T10:00:00..."
}

/**
 * Listens to user document for lastCalendarUpdate changes.
 * When backend updates this field, callback is invoked.
 * Returns unsubscribe function.
 */
export function subscribeToCalendarUpdateTriggers(
  userId: string,
  onTrigger: (trigger: CalendarUpdateTrigger) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  // Listen to user document: users/{userId}
  const docRef = doc(db, "users", userId);

  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.lastCalendarUpdate) {
          onTrigger({
            lastCalendarUpdate: data.lastCalendarUpdate,
            lastCalendarUpdateEventDate: data.lastCalendarUpdateEventDate,
          });
        }
      }
    },
    (error) => {
      console.error("[Calendar Trigger] Firestore listener error:", error);
      if (onError) {
        onError(error);
      }
    },
  );

  return unsubscribe;
}
