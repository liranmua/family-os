// Family OS — יומן Google, קריאה בלבד (שלב 3, המשך + עידון).
//
// הרשאה נפרדת מזו של ה-Sign-In הבסיסי (שם ביקשנו רק זיהוי): Firebase Auth לא
// מרענן טוקני Google API, אז לגישת יומן משתמשים ב-Google Identity Services
// (GIS) בנפרד, עם אותו OAuth Client ID שכבר קיים מהפעלת ה-Sign-In ב-Firebase.
// לא נוצר Client ID חדש. אין כתיבה/עריכה/מחיקה של אירועים — קריאה בלבד.
//
// בחירת יומנים: כברירת מחדל רק היומן הראשי, כדי לא להציג יומני "ימי הולדת"/
// חגים אוטומטיים בלי שהמשתמש ביקש. ניתן להוסיף יומנים נוספים דרך מסך ההגדרות.
//
// כרגע: היומן של לירן בלבד. מורן תתחבר בנפרד כשתצטרף (מושהה ביוזמתו).

import { getMeta, setMeta } from "./state.js";
import { GOOGLE_OAUTH_CLIENT_ID } from "./constants.js";

const CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const DAYS_AHEAD = 7;

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let events = [];
let lastFetchedAt = null;
let hasGranted = false; // "המשתמש חיבר את היומן במכשיר הזה בעבר" — לא תלוי בתקפות הטוקן הרגעית
let lastError = null;
let onChange = () => {};

let allCalendars = []; // [{id, summary, primary, backgroundColor}] — נטען רק כשפותחים את מסך הבחירה
let selectedIds = null; // מערך מזהי יומנים; null = עוד לא נבחר (יקבל ברירת מחדל = הראשי בלבד)

export function isConnected() { return hasGranted; }
export function getEvents() { return events; }
export function getLastFetchedAt() { return lastFetchedAt; }
export function getLastError() { return lastError; }
export function getAllCalendars() { return allCalendars; }
export function getSelectedCalendarIds() { return selectedIds || []; }

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
  selectedIds = await getMeta("calendarSelectedIds", null);

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
  ensureSelectionThenFetch();
}

async function ensureSelectionThenFetch() {
  if (selectedIds === null) await fetchCalendarList(); // גם קובע ברירת מחדל = היומן הראשי בלבד
  await doFetch();
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
  allCalendars = [];
  selectedIds = null;
  await setMeta("calendarGranted", false);
  await setMeta("calendarEventsCache", null);
  await setMeta("calendarSelectedIds", null);
  onChange();
}

// מוודא טוקן תקף ואז שולף אירועים. אם הטוקן פג — מבקש רענון שקט (prompt ריק);
// אם למשתמש עדיין יש session פעיל אצל גוגל זה יעבוד בלי חלון קופץ.
export function fetchEvents() {
  if (!tokenClient) return;
  if (accessToken && Date.now() < tokenExpiresAt - 30000) { ensureSelectionThenFetch(); return; }
  tokenClient.requestAccessToken({ prompt: "" });
}

// רשימת כל היומנים בחשבון (לא רק הראשי) — לצורך מסך הבחירה. בפעם הראשונה
// גם קובע ברירת מחדל: רק היומן שמסומן primary.
export async function fetchCalendarList() {
  if (!accessToken) return;
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    allCalendars = (data.items || [])
      .map((c) => ({ id: c.id, summary: c.summary || c.id, primary: !!c.primary }))
      .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    if (selectedIds === null) {
      const primary = allCalendars.find((c) => c.primary);
      selectedIds = primary ? [primary.id] : allCalendars.slice(0, 1).map((c) => c.id);
      await setMeta("calendarSelectedIds", selectedIds);
    }
  } catch (e) {
    console.warn("calendarList fetch failed:", e);
  }
  onChange();
}

export async function setSelectedCalendarIds(ids) {
  selectedIds = ids;
  await setMeta("calendarSelectedIds", ids);
  onChange();
  await doFetch();
}

async function doFetch() {
  if (!accessToken) return;
  const ids = selectedIds && selectedIds.length ? selectedIds : ["primary"];
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD).toISOString();
  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  try {
    const results = await Promise.all(
      ids.map((calId) =>
        fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .catch(() => ({ items: [] }))
      )
    );
    const merged = [];
    results.forEach((data) => {
      (data.items || []).forEach((ev) => {
        merged.push({
          id: ev.id,
          title: ev.summary || "(ללא כותרת)",
          start: (ev.start && (ev.start.dateTime || ev.start.date)) || "",
          allDay: !!(ev.start && ev.start.date && !ev.start.dateTime),
        });
      });
    });
    merged.sort((a, b) => a.start.localeCompare(b.start));
    events = merged;
    lastFetchedAt = new Date();
    lastError = null;
    await setMeta("calendarEventsCache", { events, fetchedAt: lastFetchedAt.toISOString() });
  } catch (e) {
    console.warn("calendar fetch failed:", e);
    lastError = "שליפת האירועים נכשלה — מוצגים אירועים ישנים אם היו.";
  }
  onChange();
}
