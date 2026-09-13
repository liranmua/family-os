// Family OS — יומן Google, קריאה בלבד (שלב 3, המשך).
//
// הרשאה נפרדת מזו של ה-Sign-In הבסיסי (שם ביקשנו רק זיהוי): Firebase Auth לא
// מרענן טוקני Google API, אז לגישת יומן משתמשים ב-Google Identity Services
// (GIS) בנפרד, עם אותו OAuth Client ID שכבר קיים מהפעלת ה-Sign-In ב-Firebase.
// לא נוצר Client ID חדש. אין כתיבה/עריכה/מחיקה של אירועים — קריאה בלבד.
//
// כרגע: היומן של לירן בלבד. מורן תתחבר בנפרד כשתצטרף (מושהה ביוזמתו).

import { getMeta, setMeta } from "./state.js";

const CLIENT_ID = "670882998874-24bkovc1crf6sfdpf3mkg1nla2a0n1bf.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const DAYS_AHEAD = 6;

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let events = [];
let lastFetchedAt = null;
let hasGranted = false; // "המשתמש חיבר את היומן במכשיר הזה בעבר" — לא תלוי בתקפות הטוקן הרגעית
let lastError = null;
let onChange = () => {};

export function isConnected() { return hasGranted; }
export function getEvents() { return events; }
export function getLastFetchedAt() { return lastFetchedAt; }
export function getLastError() { return lastError; }

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("טעינת Google Identity Services נכשלה — בדקו חיבור לרשת"));
    document.head.appendChild(s);
  });
}

export async function initCalendar(changeHandler) {
  onChange = changeHandler || (() => {});

  // עותק אחרון שהיה שמור — מוצג מיד, גם אם הרענון בפועל עוד לא הגיע
  const cache = await getMeta("calendarEventsCache", null);
  if (cache) {
    events = cache.events || [];
    lastFetchedAt = cache.fetchedAt ? new Date(cache.fetchedAt) : null;
  }
  hasGranted = await getMeta("calendarGranted", false);

  try {
    await loadGis();
  } catch (e) {
    lastError = e.message;
    onChange();
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: handleTokenResponse,
    error_callback: (err) => {
      lastError = err && err.type === "popup_closed" ? null : "ההתחברות ליומן לא הושלמה.";
      onChange();
    },
  });

  onChange();
  if (hasGranted) fetchEvents(); // ניסיון רענון שקט (prompt ריק) ברקע
}

function handleTokenResponse(resp) {
  if (resp.error) {
    lastError = "ההתחברות ליומן נכשלה (" + resp.error + ").";
    onChange();
    return;
  }
  accessToken = resp.access_token;
  tokenExpiresAt = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3500 * 1000);
  hasGranted = true;
  lastError = null;
  setMeta("calendarGranted", true);
  onChange();
  doFetch();
}

// מבקש הרשאה מפורשת (חלון הסכמה של גוגל) — לכפתור "חבר את היומן".
export function connectCalendar() {
  if (!tokenClient) return;
  lastError = null;
  tokenClient.requestAccessToken({ prompt: "consent" });
}

export async function disconnectCalendar() {
  if (accessToken && window.google?.accounts?.oauth2?.revoke) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
  hasGranted = false;
  events = [];
  lastFetchedAt = null;
  await setMeta("calendarGranted", false);
  await setMeta("calendarEventsCache", null);
  onChange();
}

// מוודא טוקן תקף ואז שולף אירועים. אם הטוקן פג — מבקש רענון שקט (prompt ריק);
// אם למשתמש עדיין יש session פעיל אצל גוגל זה יעבוד בלי חלון קופץ.
export function fetchEvents() {
  if (!tokenClient) return;
  if (accessToken && Date.now() < tokenExpiresAt - 30000) { doFetch(); return; }
  tokenClient.requestAccessToken({ prompt: "" });
}

async function doFetch() {
  if (!accessToken) return;
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD).toISOString();
  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
    new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    events = (data.items || []).map((ev) => ({
      id: ev.id,
      title: ev.summary || "(ללא כותרת)",
      start: (ev.start && (ev.start.dateTime || ev.start.date)) || "",
      allDay: !!(ev.start && ev.start.date && !ev.start.dateTime),
    }));
    lastFetchedAt = new Date();
    lastError = null;
    await setMeta("calendarEventsCache", { events, fetchedAt: lastFetchedAt.toISOString() });
  } catch (e) {
    console.warn("calendar fetch failed:", e);
    lastError = "שליפת האירועים נכשלה — מוצגים אירועים ישנים אם היו.";
  }
  onChange();
}
