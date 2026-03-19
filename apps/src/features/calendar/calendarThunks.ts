import { auth } from "@/src/lib/firebase";
import { getLocalDayBounds } from "@/src/utils/dateUtils";

import type { CalendarEvent } from "./calendarSlice";
import { eventsLoading, eventsReceived, eventsFailed } from "./calendarSlice";
import type { AppDispatch } from "@/src/store";

type EventsApiResponse = {
  events?: CalendarEvent[];
  error?: { code?: string; message?: string };
};

/**
 * Fetches calendar events for a given date (fetches the full day).
 * @param dateISO - ISO date string like "2026-03-18"
 */
export function fetchCalendarEvents(dateISO: string) {
  return async (dispatch: AppDispatch) => {
    dispatch(eventsLoading());

    try {
      const user = auth.currentUser;
      if (!user) {
        dispatch(eventsFailed("User is not authenticated."));
        return;
      }

      const idToken = await user.getIdToken();

      // Fetch events for the full day in the user's local timezone
      const { start, end } = getLocalDayBounds(dateISO);

      const response = await fetch(
        `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as EventsApiResponse;
        throw new Error(body.error?.message ?? "Failed to fetch calendar events.");
      }

      const data = (await response.json()) as EventsApiResponse;
      dispatch(eventsReceived(data.events ?? []));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch calendar events.";
      dispatch(eventsFailed(message));
    }
  };
}
