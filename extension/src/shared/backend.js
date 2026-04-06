import { config } from "../config.js";
import { auth } from "./firebase.js";

// ─── No-op (backend handles message persistence) ───

export async function addConversationMessage(uid, role, text) {}

// ─── Helper ───

async function getIdToken() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not authenticated.");
  return token;
}

// ─── action-history ───

/**
 * Fetch action history from the backend API.
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export async function fetchActionHistory(uid) {
  const idToken = await getIdToken();
  const res = await fetch(`${config.backendUrl}/api/calendar/history`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    console.warn("Failed to fetch action history:", res.status);
    return [];
  }

  const data = await res.json();
  return data.actionHistory || [];
}

// ─── calendar events ───

/**
 * Fetch calendar events from the backend API.
 * @param {string} uid
 * @param {string} startISO - ISO date string for range start
 * @param {string} endISO - ISO date string for range end
 * @returns {Promise<Array>}
 */
export async function fetchEvents(uid, startISO, endISO) {
  const idToken = await getIdToken();
  const url = `${config.backendUrl}/api/calendar/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    console.warn("Failed to fetch calendar events:", res.status);
    return [];
  }

  const data = await res.json();
  return data.events || [];
}

// ─── rollback ───

/**
 * Rollback an action via the backend API.
 * @param {string} actionId
 * @param {string} eventId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function rollbackAction(actionId, eventId) {
  const idToken = await getIdToken();
  const res = await fetch(`${config.backendUrl}/api/calendar/rollback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ actionId, eventId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Rollback failed.");
  }
  return data;
}
