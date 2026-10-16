// Family OS — פענוח תגובת Sheets API (values:batchGet) של גיליון "מעקב מניות v2" (Family_OS_Market_Brief.md).
// פונקציות טהורות בלבד — בלי DOM, בלי רשת, בלי אחסון. האפליקציה לא מחשבת מחדש כלום: רק קוראת מה שהגיליון חישב.
// העמודות נמצאות לפי שם הכותרת בשורה 1 (לא לפי מיקום), כך ששינוי סדר עמודות בגיליון לא שובר את המסך.

export const MARKET_EMAIL = "liranmua@gmail.com";
export const isMarketUser = (user) => !!user && user.email === MARKET_EMAIL;

// שמות הלשוניות + הטווחים שנקראים (בסדר קבוע — התשובה חוזרת באותו סדר).
export const MARKET_TABS = [
  { key: "summary", title: "סיכום", range: "A1:B20" },
  { key: "targets", title: "יעדים", range: "A1:G40" },
  { key: "holdings", title: "התיק שלי", range: "A1:X60" },
  { key: "watch", title: "מעקב", range: "A1:N40" },
];

export const rangeFor = (tab) => `'${tab.title}'!${tab.range}`;

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
export const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rowsOf = (vr) => (vr && Array.isArray(vr.values) ? vr.values : null);

// מספר סידורי של Sheets (ימים מאז 30/12/1899, בשעון הגיליון — ללא אזור זמן) -> {d, m, hh, mm}
export function serialToParts(serial) {
  const n = num(serial);
  if (n === null) return null;
  const dt = new Date(Math.round((n - 25569) * 86400000));
  if (isNaN(dt)) return null;
  const p = (x) => String(x).padStart(2, "0");
  return { text: `${p(dt.getUTCDate())}/${p(dt.getUTCMonth() + 1)} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}` };
}

// טבלה עם כותרות בשורה 1 -> רשימת אובייקטים לפי שם עמודה. null אם חסרה עמודה חיונית.
function parseTable(values, required) {
  if (!values || !values.length) return null;
  const header = values[0].map(str);
  const idx = {};
  header.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });
  if (required.some((r) => !(r in idx))) return null;
  return values.slice(1).map((row) => {
    const o = {};
    for (const h of Object.keys(idx)) o[h] = row[idx[h]];
    return o;
  });
}

export function parseSummary(vr) {
  const values = rowsOf(vr);
  if (!values) return null;
  const map = {};
  for (const row of values) {
    const k = str(row[0]);
    if (k) map[k] = row[1];
  }
  if (!Object.keys(map).length) return null;
  const g = (k) => num(map[k]);
  return {
    value: g("שווי השקעות"), cost: g("עלות השקעות"),
    pl: g("רווח/הפסד השקעות"), plPct: g("רווח/הפסד השקעות %"),
    day: g("שינוי יומי"), dayPct: g("שינוי יומי %"),
    liquid: g("כספית ומזומן"), total: g("שווי כולל (כולל נזיל)"),
    usd: g("שער דולר/שקל"), updated: serialToParts(map["עודכן לאחרונה"]),
  };
}

const LIQUID_TYPES = ["כספית", "מזומן"];

export function parseHoldings(vr) {
  const rows = parseTable(rowsOf(vr), ["שם לתצוגה"]);
  if (!rows) return null;
  const items = rows
    .filter((r) => str(r["שם לתצוגה"]))
    .map((r) => ({
      name: str(r["שם לתצוגה"]), symbol: str(r["סימול ב-Google"]), secId: str(r["מס' ני\"ע"]),
      type: str(r["סוג"]), bucket: str(r["אפיק"]), qty: num(r["כמות"]), cost: num(r["עלות כוללת ₪"]),
      priceSource: str(r["מקור מחיר"]), currency: str(r["מטבע"]), price: num(r["מחיר נוכחי"]),
      dayPct: num(r["שינוי יומי %"]), value: num(r["שווי ₪"]), pl: num(r["רווח/הפסד ₪"]), plPct: num(r["רווח/הפסד %"]),
      weight: num(r["משקל בהשקעות"]), high: num(r["שיא 52 שבועות"]), low: num(r["שפל 52 שבועות"]),
      fromHigh: num(r["מרחק מהשיא"]), pe: num(r["מכפיל רווח (P/E)"]), note: str(r["הערה"]),
    }));
  const byValueDesc = (a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity);
  return {
    investments: items.filter((i) => !LIQUID_TYPES.includes(i.type)).sort(byValueDesc),
    liquid: items.filter((i) => LIQUID_TYPES.includes(i.type)).sort(byValueDesc),
  };
}

// יעדים: שני בלוקים באותה לשונית. בלוק מתחיל בשורה ש-A=<כותרת>, נגמר ב-A='סה"כ' או בשורה ריקה.
function targetsBlock(values, startLabel) {
  const start = values.findIndex((r) => str(r[0]) === startLabel);
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 1; i < values.length; i++) {
    const r = values[i];
    const a = str(r[0]);
    if (a === 'סה"כ' || !r.some((c) => str(c) !== "")) break;
    rows.push({
      name: a, targetPct: num(r[1]), secId: str(r[2]), actual: num(r[3]), actualPct: num(r[4]),
      target: num(r[5]), gap: num(r[6]),
    });
  }
  return rows;
}

export function parseTargets(vr) {
  const values = rowsOf(vr);
  if (!values) return null;
  const byType = targetsBlock(values, "סוג");
  const bySecurity = targetsBlock(values, "נייר");
  if (!byType && !bySecurity) return null;
  return {
    // בבלוק "לפי סוג" מסתירים שורות שבהן גם היעד וגם הבפועל 0.
    byType: byType && byType.filter((r) => !((r.targetPct ?? 0) === 0 && (r.actual ?? 0) === 0)),
    bySecurity,
  };
}

export function parseWatch(vr) {
  const rows = parseTable(rowsOf(vr), ["סימול"]);
  if (!rows) return null;
  return rows
    .filter((r) => str(r["סימול"]))
    .map((r) => ({
      symbol: str(r["סימול"]), why: str(r["הערה / למה אני עוקב"]), name: str(r["שם"]), currency: str(r["מטבע"]),
      price: num(r["מחיר"]), dayPct: num(r["שינוי יומי %"]), high: num(r["שיא 52 שבועות"]), low: num(r["שפל 52 שבועות"]),
      fromHigh: num(r["מרחק מהשיא"]), pe: num(r["מכפיל רווח (P/E)"]), eps: num(r["רווח למניה (EPS)"]), cap: num(r["שווי שוק"]),
    }));
}

// התגובה המלאה. tabsRequested = המפתחות שביקשנו בפועל (בסדר); לשונית שלא התבקשה/חסרה -> null (מקטע "המבנה השתנה").
export function parseBatch(json, tabsRequested = MARKET_TABS.map((t) => t.key)) {
  const byKey = {};
  tabsRequested.forEach((k, i) => { byKey[k] = (json && json.valueRanges && json.valueRanges[i]) || null; });
  return {
    summary: byKey.summary ? parseSummary(byKey.summary) : null,
    targets: byKey.targets ? parseTargets(byKey.targets) : null,
    holdings: byKey.holdings ? parseHoldings(byKey.holdings) : null,
    watch: byKey.watch ? parseWatch(byKey.watch) : null,
  };
}

// סיווג כשל של ה-API -> סוג הודעה (ראו "מצבים" במסמך). status=0 -> שגיאת רשת.
export function classifyApiError(status, bodyText) {
  if (!status) return "network";
  let reasons = "";
  try {
    const j = JSON.parse(bodyText || "{}");
    const e = j.error || {};
    reasons = JSON.stringify([e.status, ...(e.details || []).map((d) => d.reason)]);
  } catch (_) { /* גוף לא-JSON */ }
  if (status === 403 && /SERVICE_DISABLED|accessNotConfigured/i.test(reasons + (bodyText || ""))) return "apiDisabled";
  if (status === 401) return "auth";
  if (status === 403 || status === 404) return "sheetUnreadable";
  return "network";
}

// 400 "Unable to parse range" = לשונית חסרה בגיליון -> נקרא שוב רק את הקיימות.
export const isMissingTabError = (status, bodyText) => status === 400 && /Unable to parse range/i.test(bodyText || "");
