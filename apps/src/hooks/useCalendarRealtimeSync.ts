/**
 * Hook to manage calendar real-time synchronization via Firestore triggers.
 * Listens for update triggers from backend, then fetches and switches to calendar.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/src/hooks";
import { auth } from "@/src/lib/firebase";
import { subscribeToCalendarUpdateTriggers } from "@/src/services/calendar/firebaseCalendarService";
import {
  setCalendarOpenWithDate,
} from "@/src/features/calendar/calendarSlice";
import { fetchCalendarEvents } from "@/src/features/calendar/calendarThunks";
import { getTodayLocalISO } from "@/src/utils/dateUtils";
import type { Unsubscribe } from "firebase/firestore";

export function useCalendarRealtimeSync() {
  const dispatch = useAppDispatch();
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const isInitializedRef = useRef(false);

  // Get current user from auth to determine if we should listen
  const authUser = useAppSelector((state) => state.auth.user);

  const startListener = useCallback(() => {
    // Only start if user is authenticated and listener not already running
    const user = auth.currentUser;
    if (!user || isInitializedRef.current) {
      console.log("[useCalendarRealtimeSync] Skipping start - user:", !!user, "initialized:", isInitializedRef.current);
      return;
    }

    console.log("[useCalendarRealtimeSync] Starting trigger listener for user:", user.uid);
    isInitializedRef.current = true;

    unsubscribeRef.current = subscribeToCalendarUpdateTriggers(
      user.uid,
      (trigger) => {
        console.log("[useCalendarRealtimeSync] Received calendar update trigger", trigger);
        console.log("[useCalendarRealtimeSync] lastCalendarUpdateEventDate:", trigger.lastCalendarUpdateEventDate);
        
        // Extract date from event start (format: "YYYY-MM-DDTHH:MM:SS±HH:MM")
        // If no date provided, default to today
        let targetDate = getTodayLocalISO();
        if (trigger.lastCalendarUpdateEventDate) {
          const eventStart = trigger.lastCalendarUpdateEventDate;
          console.log("[useCalendarRealtimeSync] Raw event start:", eventStart);
          targetDate = eventStart.split("T")[0];
          console.log("[useCalendarRealtimeSync] Extracted date:", targetDate);
        } else {
          console.log("[useCalendarRealtimeSync] No event date provided, using today:", targetDate);
        }
        
        // Fetch events for the target date
        console.log("[useCalendarRealtimeSync] Fetching events for date:", targetDate);
        void dispatch(fetchCalendarEvents(targetDate));

        // Switch to calendar tab and select the target date
        console.log("[useCalendarRealtimeSync] Switching calendar to date:", targetDate);
        dispatch(setCalendarOpenWithDate(targetDate));
      },
      (error) => {
        console.error("Calendar trigger listener error:", error);
      }
    );
  }, [dispatch]);

  const stopListener = useCallback(() => {
    if (unsubscribeRef.current) {
      console.log("[useCalendarRealtimeSync] Stopping trigger listener");
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    isInitializedRef.current = false;
  }, []);

  // Start listener when user logs in, stop when logs out
  useEffect(() => {
    console.log("[useCalendarRealtimeSync] useEffect - authUser changed:", !!authUser);
    if (authUser) {
      startListener();
    } else {
      stopListener();
    }

    return () => {
      // Cleanup on unmount
      stopListener();
    };
  }, [authUser, startListener, stopListener]);
}
