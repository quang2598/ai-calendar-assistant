import { getAuthState } from "../shared/auth.js";
import { fetchActionHistory, fetchEvents, rollbackAction } from "../shared/backend.js";
import { onMessage, onStorageChanged } from "../shared/messages.js";

// ─── DOM Elements ───
const authPlaceholder = document.getElementById("auth-placeholder");
const mainScreen = document.getElementById("main-screen");
const tabs = document.querySelectorAll(".tab");
const tabEvents = document.getElementById("tab-events");
const tabHistory = document.getElementById("tab-history");
const calendarDays = document.getElementById("calendar-days");
const calendarMonthLabel = document.getElementById("calendar-month-label");
const btnPrevMonth = document.getElementById("btn-prev-month");
const btnNextMonth = document.getElementById("btn-next-month");
const eventsDateLabel = document.getElementById("events-date-label");
const eventsList = document.getElementById("events-list");
const historyList = document.getElementById("history-list");
const toastContainer = document.getElementById("toast-container");
const btnClosePanel = document.getElementById("btn-close-panel");

// ─── State ───
let firebaseUid = null;
let authToken = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedDate = new Date();
let calendarEvents = []; // From backend API
let refreshInterval = null;

// ─── Init ───
(async function init() {
  const stored = await getAuthState();
  if (stored.authToken && stored.firebaseUid) {
    firebaseUid = stored.firebaseUid;
    authToken = stored.authToken;
    showMainScreen();
    renderCalendar();
    refreshAll();
    startPeriodicRefresh();
  }
})();

// ─── Auth State Changes ───
onStorageChanged((changes) => {
  if (changes.firebaseUid || changes.authToken) {
    getAuthState().then((stored) => {
      if (stored.authToken && stored.firebaseUid) {
        firebaseUid = stored.firebaseUid;
        authToken = stored.authToken;
        showMainScreen();
        renderCalendar();
        refreshAll();
        startPeriodicRefresh();
      } else {
        firebaseUid = null;
        authToken = null;
        stopPeriodicRefresh();
        showAuthPlaceholder();
      }
    });
  }
});

onMessage((message) => {
  if (message.action === "refreshCalendarEvents" || message.action === "agentResponseReceived") {
    refreshAll();
  }

  if (message.action === "authChanged") {
    getAuthState().then((stored) => {
      if (stored.authToken && stored.firebaseUid) {
        firebaseUid = stored.firebaseUid;
        authToken = stored.authToken;
        showMainScreen();
        renderCalendar();
        refreshAll();
        startPeriodicRefresh();
      } else {
        showAuthPlaceholder();
      }
    });
  }
});

// ─── Data Fetching (via backend API) ───

async function refreshCalendarEvents() {
  if (!firebaseUid) return;

  try {
    const start = new Date(currentYear, currentMonth, 1);
    const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    const events = await fetchEvents(firebaseUid, start.toISOString(), end.toISOString());
    calendarEvents = events.map((evt) => ({
      id: evt.id,
      title: evt.title || evt.summary || "Untitled Event",
      startTime: evt.start,
      endTime: evt.end,
      allDay: evt.allDay || false,
    }));
    renderCalendar();
    renderEventsForDate(selectedDate);
  } catch (err) {
    console.warn("Failed to fetch calendar events:", err);
  }
}

async function refreshActionHistory() {
  if (!firebaseUid) return;

  try {
    const actions = await fetchActionHistory(firebaseUid);
    renderActionHistory(actions);
  } catch (err) {
    console.warn("Failed to fetch action history:", err);
  }
}

async function refreshAll() {
  await Promise.all([refreshCalendarEvents(), refreshActionHistory()]);
}

function startPeriodicRefresh() {
  stopPeriodicRefresh();
  // Refresh every 2 minutes
  refreshInterval = setInterval(() => refreshAll(), 120000);
}

function stopPeriodicRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// ─── Tabs ───
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const target = tab.dataset.tab;

    tabEvents.classList.add("hidden");
    tabEvents.classList.remove("active");
    tabHistory.classList.add("hidden");
    tabHistory.classList.remove("active");

    if (target === "events") {
      tabEvents.classList.remove("hidden");
      tabEvents.classList.add("active", "tab-enter");
    } else if (target === "history") {
      tabHistory.classList.remove("hidden");
      tabHistory.classList.add("active", "tab-enter");
    }

    setTimeout(() => {
      tabEvents.classList.remove("tab-enter");
      tabHistory.classList.remove("tab-enter");
    }, 300);
  });
});

// ─── Close Panel ───
btnClosePanel.addEventListener("click", () => {
  window.close();
});

// ─── Calendar ───

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

btnPrevMonth.addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
  renderEventsForDate(selectedDate);
  refreshCalendarEvents(); // Fetch events for new month
});

btnNextMonth.addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  renderCalendar();
  renderEventsForDate(selectedDate);
  refreshCalendarEvents(); // Fetch events for new month
});

function renderCalendar() {
  calendarMonthLabel.textContent = `${MONTHS[currentMonth]} ${currentYear}`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();

  calendarDays.innerHTML = "";

  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.appendChild(createDayEl(daysInPrevMonth - i, true));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear();

    const isSelected =
      day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear();

    const hasEvents = dateHasEvents(currentYear, currentMonth, day);

    const el = createDayEl(day, false, isToday, isSelected, hasEvents);
    el.addEventListener("click", () => {
      selectedDate = new Date(currentYear, currentMonth, day);
      renderCalendar();
      renderEventsForDate(selectedDate);
    });
    calendarDays.appendChild(el);
  }

  const totalCells = calendarDays.children.length;
  const remaining = 42 - totalCells;
  for (let day = 1; day <= remaining; day++) {
    calendarDays.appendChild(createDayEl(day, true));
  }
}

function createDayEl(
  day,
  isOtherMonth,
  isToday = false,
  isSelected = false,
  hasEvents = false,
) {
  const btn = document.createElement("button");
  btn.className = "cal-day";
  btn.textContent = day;
  if (isOtherMonth) btn.classList.add("other-month");
  if (isToday) btn.classList.add("today");
  if (isSelected) btn.classList.add("selected");

  if (hasEvents) {
    const dot = document.createElement("span");
    dot.className = "event-dot";
    btn.appendChild(dot);
  }

  return btn;
}

function dateHasEvents(year, month, day) {
  const allEvents = calendarEvents;
  return allEvents.some((evt) => {
    const raw = evt.startTime;
    if (!raw) return false;
    const d = raw.toDate ? raw.toDate() : new Date(raw);
    return (
      d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    );
  });
}

// ─── Events List ───

function renderEventsForDate(date) {
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  eventsDateLabel.textContent = isToday
    ? "Today's Events"
    : `Events - ${dateStr}`;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const allEvents = calendarEvents;
  const dayEvents = allEvents.filter((evt) => {
    const raw = evt.startTime;
    if (!raw) return false;
    const d = raw.toDate ? raw.toDate() : new Date(raw);
    return d >= dayStart && d <= dayEnd;
  });

  if (dayEvents.length === 0) {
    eventsList.innerHTML =
      '<div class="text-xs text-white/30 text-center py-4">No events for this day</div>';
    return;
  }

  eventsList.innerHTML = "";
  dayEvents.forEach((evt) => {
    const d = evt.startTime?.toDate
      ? evt.startTime.toDate()
      : new Date(evt.startTime);
    const timeStr = evt.allDay
      ? "All day"
      : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    const endD = evt.endTime ? new Date(evt.endTime) : null;
    const endStr =
      endD && !evt.allDay
        ? ` - ${endD.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : "";

    const item = document.createElement("div");
    item.className = "event-item";
    item.innerHTML = `
      <div class="event-time-bar"></div>
      <div>
        <div class="text-sm font-medium text-white/90">${escapeHtml(evt.title)}</div>
        <div class="text-xs text-white/40">${timeStr}${endStr}</div>
      </div>
    `;
    eventsList.appendChild(item);
  });
}

// ─── Action History ───

function renderActionHistory(actions) {
  if (actions.length === 0) {
    historyList.innerHTML =
      '<div class="text-xs text-white/30 text-center py-4">No actions yet</div>';
    return;
  }

  // Find the latest action that hasn't been rolled back
  const latestUndoable = actions.find((a) => !a.alreadyRolledBack);
  // Check if it's within 1 hour
  const isWithinOneHour = latestUndoable && (() => {
    const created = new Date(latestUndoable.createdAt);
    return (Date.now() - created.getTime()) < 60 * 60 * 1000;
  })();

  historyList.innerHTML = "";
  actions.forEach((action) => {
    const raw = action.createdAt;
    const d = raw?.toDate ? raw.toDate() : new Date(raw || Date.now());
    const timeStr = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const actionLabel =
      action.actionType === "add"
        ? "Created"
        : action.actionType === "update"
          ? "Updated"
          : action.actionType === "delete"
            ? "Deleted"
            : action.actionType || "Action";

    const canUndo = isWithinOneHour && latestUndoable && action.id === latestUndoable.id;

    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div class="event-time-bar"></div>
      <div class="flex-1">
        <div class="text-sm font-medium text-white/90">${escapeHtml(actionLabel)}: ${escapeHtml(action.eventTitle || "")}</div>
        <div class="text-xs text-white/50">${action.alreadyRolledBack ? "Rolled back" : ""}</div>
        <div class="text-xs text-white/30 mt-1">${timeStr}</div>
      </div>
      ${canUndo ? `<button class="undo-btn text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors whitespace-nowrap" data-action-id="${action.id}" data-event-id="${action.eventId}">Undo</button>` : ""}
    `;

    if (canUndo) {
      const btn = item.querySelector(".undo-btn");
      btn.addEventListener("click", () => handleUndo(action.id, action.eventId, btn));
    }

    historyList.appendChild(item);
  });
}

async function handleUndo(actionId, eventId, btn) {
  btn.disabled = true;
  btn.textContent = "Undoing...";

  try {
    const result = await rollbackAction(actionId, eventId);
    showToast(result.message || "Action undone successfully");
    refreshAll();
  } catch (err) {
    showToast(`Undo failed: ${err.message}`);
    btn.disabled = false;
    btn.textContent = "Undo";
  }
}

// ─── Toast ───

function showToast(message) {
  const toast = document.createElement("div");
  toast.className =
    "glass rounded-xl px-4 py-3 text-sm text-white/90 mb-2 toast-enter pointer-events-auto";
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-green-400"></div>
      ${escapeHtml(message)}
    </div>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("toast-enter");
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Helpers ───

function showAuthPlaceholder() {
  authPlaceholder.classList.remove("hidden");
  mainScreen.classList.add("hidden");
}

function showMainScreen() {
  authPlaceholder.classList.add("hidden");
  mainScreen.classList.remove("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
