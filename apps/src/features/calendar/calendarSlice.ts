import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { getTodayLocalISO, dateToLocalISO } from "@/src/utils/dateUtils";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  color: string | null;
};

type CalendarState = {
  isCalendarOpen: boolean;
  selectedDate: string;
  viewMonth: number;
  viewYear: number;
  events: CalendarEvent[];
  eventsStatus: "idle" | "loading" | "succeeded" | "failed";
  eventsError: string | null;
};

const now = new Date();

const initialState: CalendarState = {
  isCalendarOpen: false,
  selectedDate: getTodayLocalISO(),
  viewMonth: now.getMonth(),
  viewYear: now.getFullYear(),
  events: [],
  eventsStatus: "idle",
  eventsError: null,
};

const calendarSlice = createSlice({
  name: "calendar",
  initialState,
  reducers: {
    toggleCalendar(state) {
      state.isCalendarOpen = !state.isCalendarOpen;
    },
    setCalendarOpen(state, action: PayloadAction<boolean>) {
      state.isCalendarOpen = action.payload;
    },
    setSelectedDate(state, action: PayloadAction<string>) {
      state.selectedDate = action.payload;
    },
    setViewMonth(state, action: PayloadAction<{ month: number; year: number }>) {
      state.viewMonth = action.payload.month;
      state.viewYear = action.payload.year;
    },
    eventsLoading(state) {
      state.eventsStatus = "loading";
      state.eventsError = null;
    },
    eventsReceived(state, action: PayloadAction<CalendarEvent[]>) {
      state.events = action.payload;
      state.eventsStatus = "succeeded";
      state.eventsError = null;
    },
    eventsFailed(state, action: PayloadAction<string>) {
      state.eventsStatus = "failed";
      state.eventsError = action.payload;
    },
    setCalendarOpenWithDate(state, action: PayloadAction<string>) {
      // Open calendar and set the selected date to the event's date
      state.isCalendarOpen = true;
      state.selectedDate = action.payload;
      // Update view month/year to match the selected date
      const date = new Date(`${action.payload}T00:00:00`);
      state.viewMonth = date.getMonth();
      state.viewYear = date.getFullYear();
    },
  },
});

export const {
  toggleCalendar,
  setCalendarOpen,
  setSelectedDate,
  setViewMonth,
  eventsLoading,
  eventsReceived,
  eventsFailed,
  setCalendarOpenWithDate,
} = calendarSlice.actions;

export default calendarSlice.reducer;
