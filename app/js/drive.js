// Family OS — Google Drive, קריאה בלבד (שדרוג לקישורי הפרויקטים, Family_OS_Drive_Brief.md).
//
// הרשאה נפרדת מזו של ה-Sign-In/היומן: scope צר בכוונה — drive.file, שחל רק על
// קבצים שהמשתמש עצמו בחר דרך ה-Picker (לא כל הדרייב). דרך Google Identity
// Services, באותו OAuth Client ID שכבר קיים (ראו calendar.js). אין יצירה/עריכה/
// מחיקה של קבצים — רק בחירה וצירוף "קישור חי" לקובץ קיים.
//
// זרימה בכוונה בשני שלבים נפרדים: (1) פעם אחת, מהגדרות — בוחרים תיקייה משפחתית
// ספציפית אחת (Picker במצב בחירת-תיקייה). (2) מכל מסך פרויקט — בוחרים קובץ
// *מתוך* אותה תיקייה בלבד (Picker מוגבל ל-parent). כך התיקייה נבחרת פעם אחת,
// לא בכל צירוף קובץ.
//
// מפתח ה-API למטה הוא "browser key" ציבורי-בכוונה (בדיוק כמו מפתחות ה-Firebase
// שכבר בקוד) — מוגבל ב-Google Cloud Console ל-referrer של האתר ול-2 שירותים
// בלבד (Picker + Drive), לא סוד.

import { getMeta, setMeta } from "./state.js";
import { GOOGLE_OAUTH_CLIENT_ID } from "./constants.js";

const CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const PICKER_API_KEY = "AIzaSyCcN2NZT9R5-btemFhBvbXobWLqxz7lGSc";

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let hasGranted = false;
let lastError = null;
let onChange = () => {};
let pickerLoaded = false;
let pendingAction = null; // "folder" | "file" | null — מה לפתוח ברגע שהטוקן מגיע

let folderId = null;
let folderName = null;

export function isConnected() { return hasGranted; }
export function getLastError() { return lastError; }
export function getFolderId() { return folderId; }
export function getFolderName() { return folderName; }

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

function loadPicker() {
  return new Promise((resolve, reject) => {
    if (pickerLoaded) { resolve(); return; }
    const afterApiLoaded = () => {
      window.gapi.load("picker", { callback: () => { pickerLoaded = true; resolve(); } });
    };
    if (window.gapi) { afterApiLoaded(); return; }
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.defer = true;
    s.onload = afterApiLoaded;
    s.onerror = () => reject(new Error("טעינת Google Picker נכשלה — בדקו חיבור לרשת"));
    document.head.appendChild(s);
  });
}

export async function initDrive(changeHandler) {
  onChange = changeHandler || (() => {});
  hasGranted = await getMeta("driveGranted", false);
  folderId = await getMeta("driveFolderId", null);
  folderName = await getMeta("driveFolderName", null);

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
      lastError = err && err.type === "popup_closed" ? null : "ההתחברות ל-Drive לא הושלמה.";
      pendingAction = null;
      onChange();
    },
  });
  onChange();
}

function handleTokenResponse(resp) {
  if (resp.error) {
    lastError = "ההתחברות ל-Drive נכשלה (" + resp.error + ").";
    pendingAction = null;
    onChange();
    return;
  }
  accessToken = resp.access_token;
  tokenExpiresAt = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3500 * 1000);
  hasGranted = true;
  lastError = null;
  setMeta("driveGranted", true);
  onChange();
  const action = pendingAction;
  pendingAction = null;
  if (action === "folder") openFolderPicker();
  else if (action === "file") openFilePicker();
}

function ensureToken(action, cb) {
  lastError = null;
  if (accessToken && Date.now() < tokenExpiresAt - 30000) { cb(); return; }
  pendingAction = action;
  tokenClient.requestAccessToken({ prompt: hasGranted ? "" : "consent" });
}

// שלב 1 — פעם אחת, מהגדרות: בחירת תיקייה משפחתית ספציפית.
export function pickFolder(onPicked) {
  if (!tokenClient) return;
  _onFolderPicked = onPicked;
  ensureToken("folder", openFolderPicker);
}

// שלב 2 — מכל מסך פרויקט: בחירת קובץ *מתוך* התיקייה שכבר נבחרה בלבד.
export function pickFile(onPicked) {
  if (!tokenClient) return;
  if (!folderId) { lastError = "קודם צריך לבחור תיקיית Drive משפחתית בהגדרות."; onChange(); return; }
  _onFilePicked = onPicked;
  ensureToken("file", openFilePicker);
}

let _onFolderPicked = null;
let _onFilePicked = null;

async function openFolderPicker() {
  try { await loadPicker(); } catch (e) { lastError = e.message; onChange(); return; }
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setIncludeFolders(true);
  new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(PICKER_API_KEY)
    .setTitle("בחירת תיקייה משפחתית ב-Drive")
    .setCallback(async (data) => {
      if (data.action !== google.picker.Action.PICKED) return;
      const doc = data.docs && data.docs[0];
      if (!doc) return;
      folderId = doc.id;
      folderName = doc.name;
      await setMeta("driveFolderId", folderId);
      await setMeta("driveFolderName", folderName);
      onChange();
      if (_onFolderPicked) _onFolderPicked({ id: folderId, name: folderName });
    })
    .build()
    .setVisible(true);
}

async function openFilePicker() {
  try { await loadPicker(); } catch (e) { lastError = e.message; onChange(); return; }
  const view = new google.picker.DocsView()
    .setParent(folderId)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);
  new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(PICKER_API_KEY)
    .setTitle(`בחירת קובץ מתוך "${folderName || "התיקייה המחוברת"}"`)
    .setCallback((data) => {
      if (data.action !== google.picker.Action.PICKED) return;
      const doc = data.docs && data.docs[0];
      if (!doc) return;
      if (_onFilePicked) _onFilePicked({ id: doc.id, name: doc.name, url: doc.url, iconUrl: doc.iconUrl, mimeType: doc.mimeType });
    })
    .build()
    .setVisible(true);
}
