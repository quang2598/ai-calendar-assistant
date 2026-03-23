import { google } from "googleapis";

import { adminDb } from "@/src/lib/firebaseAdmin";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

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

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Reads the stored refresh token from Firestore and exchanges it
 * for a fresh access token via Google's token endpoint.
 */
async function getAccessToken(uid: string): Promise<string> {
  const tokenDoc = await adminDb.doc(`users/${uid}/tokens/google`).get();

  if (!tokenDoc.exists) {
    throw new Error("Google Calendar is not connected. Please connect first.");
  }

  const refreshToken = tokenDoc.get("refreshToken") as string | undefined;
  if (!refreshToken) {
    throw new Error("No refresh token found. Please reconnect Google Calendar.");
  }

  const clientId = requireEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to refresh Google access token: ${errorBody}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google token refresh did not return an access token.");
  }

  return data.access_token;
}

/**
 * Fetches calendar events for the given user within the specified time range.
 */
export async function fetchCalendarEvents(
  uid: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken(uid);

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  const items = response.data.items ?? [];

  return items.map((item) => {
    const isAllDay = Boolean(item.start?.date);

    return {
      id: item.id ?? crypto.randomUUID(),
      title: item.summary ?? "(No title)",
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
      allDay: isAllDay,
      location: item.location ?? null,
      description: item.description ?? null,
      color: item.colorId ?? null,
    };
  });
}
