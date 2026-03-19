"use client";

import { useEffect, useCallback } from "react";

import {
  selectCalendarEvents,
  selectCalendarEventsError,
  selectCalendarEventsStatus,
  selectIsCalendarOpen,
  selectSelectedDate,
  selectViewMonth,
  selectViewYear,
} from "@/src/features/calendar/calendarSelectors";
import { getTodayLocalISO } from "@/src/utils/dateUtils";
import {
  toggleCalendar,
  setSelectedDate,
  setViewMonth,
} from "@/src/features/calendar/calendarSlice";
import type { CalendarEvent } from "@/src/features/calendar/calendarSlice";
import { fetchCalendarEvents } from "@/src/features/calendar/calendarThunks";
import { useAppDispatch, useAppSelector } from "@/src/hooks";

// ── Helpers ──────────────────────────────────────────────

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatSelectedDate(dateISO: string): string {
  const date = new Date(dateISO + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Mini Calendar Grid ───────────────────────────────────

function MiniCalendar({
  viewMonth,
  viewYear,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  viewMonth: number;
  viewYear: number;
  selectedDate: string;
  onSelectDate: (dateISO: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const todayISO = getTodayLocalISO();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="px-3 py-3">
      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-medium text-slate-200">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
        {DAYS.map((d, i) => (
          <div key={`${d}-${i}`} className="py-1">{d}</div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 text-center text-xs">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="py-1.5" />;
          }

          const dateISO = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = dateISO === selectedDate;
          const isToday = dateISO === todayISO;

          return (
            <button
              key={dateISO}
              type="button"
              onClick={() => onSelectDate(dateISO)}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full transition ${
                isSelected
                  ? "bg-cyan-500 font-semibold text-white"
                  : isToday
                    ? "font-semibold text-cyan-400 ring-1 ring-cyan-400/40"
                    : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Event List ───────────────────────────────────────────

function EventList({
  events,
  status,
  error,
  selectedDate,
}: {
  events: CalendarEvent[];
  status: string;
  error: string | null;
  selectedDate: string;
}) {
  const todayISO = getTodayLocalISO();
  const isToday = selectedDate === todayISO;
  const dateLabel = isToday ? "Today" : formatSelectedDate(selectedDate);

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-t border-slate-800/80">
      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {dateLabel} &mdash; {formatSelectedDate(selectedDate)}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {status === "loading" && (
          <div className="flex items-center gap-2 px-1 py-3 text-xs text-slate-400">
            <div className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-cyan-400" />
            Loading events...
          </div>
        )}

        {status === "failed" && error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {status === "succeeded" && events.length === 0 && (
          <p className="px-1 py-3 text-xs text-slate-500">No events for this day.</p>
        )}

        {status === "succeeded" && events.length > 0 && (
          <ul className="space-y-1.5">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 transition hover:border-slate-700"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-cyan-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {event.title}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {event.allDay
                        ? "All day"
                        : `${formatTime(event.start)} – ${formatTime(event.end)}`}
                    </p>
                    {event.location && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {event.location}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── CalendarPanel ────────────────────────────────────────

export default function CalendarPanel() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectIsCalendarOpen);
  const selectedDate = useAppSelector(selectSelectedDate);
  const viewMonth = useAppSelector(selectViewMonth);
  const viewYear = useAppSelector(selectViewYear);
  const events = useAppSelector(selectCalendarEvents);
  const eventsStatus = useAppSelector(selectCalendarEventsStatus);
  const eventsError = useAppSelector(selectCalendarEventsError);

  // Fetch events when calendar opens or selected date changes
  useEffect(() => {
    if (isOpen) {
      void dispatch(fetchCalendarEvents(selectedDate));
    }
  }, [dispatch, isOpen, selectedDate]);

  const handleSelectDate = useCallback(
    (dateISO: string) => {
      dispatch(setSelectedDate(dateISO));
    },
    [dispatch],
  );

  const handlePrevMonth = useCallback(() => {
    const newMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const newYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    dispatch(setViewMonth({ month: newMonth, year: newYear }));
  }, [dispatch, viewMonth, viewYear]);

  const handleNextMonth = useCallback(() => {
    const newMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const newYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    dispatch(setViewMonth({ month: newMonth, year: newYear }));
  }, [dispatch, viewMonth, viewYear]);

  return (
    <aside
      className={`relative hidden flex-shrink-0 flex-col border-l border-slate-800/90 bg-slate-900/80 transition-all duration-300 lg:flex ${
        isOpen ? "w-80" : "w-10"
      }`}
    >
      {/* Collapsed toggle strip */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => dispatch(toggleCalendar())}
          className="flex h-full w-full items-center justify-center text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          aria-label="Open calendar"
          title="Open calendar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}

      {/* Expanded panel */}
      {isOpen && (
        <>
          <header className="flex h-16 items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-4">
            <h2 className="text-sm font-semibold text-slate-200">Your Calendar</h2>
            <button
              type="button"
              onClick={() => dispatch(toggleCalendar())}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              aria-label="Close calendar"
              title="Close calendar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </header>

          <MiniCalendar
            viewMonth={viewMonth}
            viewYear={viewYear}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
          />

          <EventList
            events={events}
            status={eventsStatus}
            error={eventsError}
            selectedDate={selectedDate}
          />
        </>
      )}
    </aside>
  );
}
