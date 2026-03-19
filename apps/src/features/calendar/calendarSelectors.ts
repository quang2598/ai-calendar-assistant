import type { RootState } from "@/src/store";

export const selectIsCalendarOpen = (state: RootState) =>
  state.calendar.isCalendarOpen;

export const selectSelectedDate = (state: RootState) =>
  state.calendar.selectedDate;

export const selectViewMonth = (state: RootState) =>
  state.calendar.viewMonth;

export const selectViewYear = (state: RootState) =>
  state.calendar.viewYear;

export const selectCalendarEvents = (state: RootState) =>
  state.calendar.events;

export const selectCalendarEventsStatus = (state: RootState) =>
  state.calendar.eventsStatus;

export const selectCalendarEventsError = (state: RootState) =>
  state.calendar.eventsError;
