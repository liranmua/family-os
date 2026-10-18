// Family OS — פענוח תגובת Sheets API (values:batchGet) של גיליון "מרשם קופות ופוליסות" (Family_OS_Pension_Tracker_Brief.md).
// פונקציות טהורות בלבד — בלי DOM, בלי רשת, בלי אחסון. אין כאן שום נתון אמיתי; העמודות נמצאות לפי שם הכותרת בשורה 1
// (לא לפי מיקום), והשורות מזוהות לפי "מזהה" ולא לפי מספר שורה — היועץ יכול להוסיף שורות או לשנות סדר.
// אין סכומים: הטווחים מוגבלים לשתי הלשוניות "מעקב" ו"מרשם" בלבד, ואף פעם לא ללשונית "חסכונות ופנסיה".

export { isMarketUser as isPensionUser } from "./market-parse.js";

export const PENSION_TABS = [
  { key: "tracking", title: "מעקב", range: "A1:O300" },
  { key: "registry", title: "מרשם", range: "A1:J200" },
];
export const pensionRangeFor = (tab) => `'${tab.title}'!${tab.range}`;

export const PRIORITIES = ["דחוף", "לבדוק", "לידיעה"];
export const OTHER_PRIORITY = "ללא עדיפות";
export const PEOPLE_ORDER = ["לירן", "מורן", "דור", "שי", "משפחה"];
export const DOC_TYPE = "מסמך להוריד";
export const ST_DONE = "הושג";
export const ST_IRRELEVANT = "לא רלוונטי";
export const ST_WAITING = "ממתין לתשובה";

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const rowsOf = (vr) => (vr && Array.isArray(vr.values) ? vr.values : null);

// תאריך: טקסט dd/mm/yyyy (כך הוא שמור בגיליון), או מספר סידורי אם מישהו עיצב את התא כתאריך. מחזיר {text, ts} או null.
export function parseDmy(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    const dt = new Date(Math.round((v - 25569) * 86400000));
    if (isNaN(dt)) return null;
    const p = (x) => String(x).padStart(2, "0");
    return { text: `${p(dt.getUTCDate())}/${p(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`, ts: dt.getTime() };
  }
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(str(v));
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const p = (x) => String(x).padStart(2, "0");
  return { text: `${p(d)}/${p(mo)}/${y}`, ts: dt.getTime() };
}

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

export function parseTracking(vr) {
  const rows = parseTable(rowsOf(vr), ["מזהה", "עדיפות", "סטטוס"]);
  if (!rows) return null;
  return rows
    .filter((r) => str(r["מזהה"]))
    .map((r) => ({
      id: str(r["מזהה"]),
      opened: parseDmy(r["נפתח"]),
      priority: str(r["עדיפות"]),
      type: str(r["סוג"]),
      person: str(r["אדם"]),
      domain: str(r["תחום"]),
      product: str(r["מוצר"]),
      finding: str(r["ממצא"]),
      why: str(r["למה חשוב"]),
      next: str(r["הצעד הבא"]),
      lead: str(r["מוביל"]),
      status: str(r["סטטוס"]) || "פתוח", // סטטוס ריק = עדיין פתוח (עדיף להציג מאשר להעלים)
      updated: parseDmy(r["עודכן"]),
      notes: str(r["הערות"]),
      source: str(r["מקור"]),
    }));
}

export function parseRegistry(vr) {
  const rows = parseTable(rowsOf(vr), ["שם / חברה", "בעלים"]);
  if (!rows) return null;
  return rows
    .filter((r) => str(r["שם / חברה"]))
    .map((r) => ({
      category: str(r["קטגוריה"]),
      name: str(r["שם / חברה"]),
      type: str(r["סוג"]),
      owner: str(r["בעלים"]),
      reportStatus: str(r["סטטוס דוח 2025"]),
    }));
}

export function parseBatch(json, tabsRequested = PENSION_TABS.map((t) => t.key)) {
  const byKey = {};
  tabsRequested.forEach((k, i) => { byKey[k] = (json && json.valueRanges && json.valueRanges[i]) || null; });
  return {
    tracking: byKey.tracking ? parseTracking(byKey.tracking) : null,
    registry: byKey.registry ? parseRegistry(byKey.registry) : null,
  };
}

// ---- חישובים (טהורים) ----

// פתוח = כל מה שאינו הושג / לא רלוונטי (כולל סטטוס לא מוכר — עדיף להציג מאשר להעלים).
export const isOpen = (r) => r.status !== ST_DONE && r.status !== ST_IRRELEVANT;

// פס מדדים: נספר על כל השורות (בלי קשר למסננים). התקדמות = הושגו מתוך הכול פחות "לא רלוונטי".
export function computeMetrics(rows) {
  const open = rows.filter(isOpen);
  const done = rows.filter((r) => r.status === ST_DONE).length;
  const irrelevant = rows.filter((r) => r.status === ST_IRRELEVANT).length;
  const base = rows.length - irrelevant;
  let latest = null;
  for (const r of rows) if (r.updated && (!latest || r.updated.ts > latest.ts)) latest = r.updated;
  return {
    open: open.length,
    urgentOpen: open.filter((r) => r.priority === "דחוף").length,
    waiting: rows.filter((r) => r.status === ST_WAITING).length,
    done,
    irrelevant,
    base,
    progressPct: base > 0 ? Math.round((done / base) * 100) : 0,
    updatedText: latest ? latest.text : null,
  };
}

// מסננים: אדם / סוג / תחום ("" = הכול).
export function applyFilters(rows, f) {
  return rows.filter((r) => (!f.person || r.person === f.person) && (!f.type || r.type === f.type) && (!f.domain || r.domain === f.domain));
}

export function distinct(rows, key) {
  return [...new Set(rows.map((r) => r[key]).filter(Boolean))];
}

// קיבוץ לפי עדיפות, בסדר דחוף ← לבדוק ← לידיעה (ואז "ללא עדיפות" אם יש ערך לא מוכר/ריק). קבוצות ריקות לא מוחזרות.
export function groupByPriority(rows) {
  const keyOf = (r) => (PRIORITIES.includes(r.priority) ? r.priority : OTHER_PRIORITY);
  return [...PRIORITIES, OTHER_PRIORITY]
    .map((p) => ({ priority: p, items: rows.filter((r) => keyOf(r) === p) }))
    .filter((g) => g.items.length);
}

// תמונת מצב: כרטיס לכל אדם (בסדר קבוע), ואחריו כרטיס אחד לבעלים לא-מוכר/"לבדוק"/ריק. בכל כרטיס — קיבוץ לפי קטגוריה.
export const UNKNOWN_OWNER = "בעלים לא ברור";
export function snapshotByOwner(registry) {
  const ownerKey = (o) => (PEOPLE_ORDER.includes(o) ? o : UNKNOWN_OWNER);
  return [...PEOPLE_ORDER, UNKNOWN_OWNER]
    .map((owner) => {
      const items = registry.filter((p) => ownerKey(p.owner) === owner);
      const cats = [];
      for (const p of items) {
        const c = p.category || "ללא קטגוריה";
        let g = cats.find((x) => x.category === c);
        if (!g) cats.push((g = { category: c, items: [] }));
        g.items.push(p);
      }
      return { owner, categories: cats, count: items.length };
    })
    .filter((c) => c.count);
}

// צבע לתגית "סטטוס דוח 2025": נמצא=ירוק, חסר/לא נמצא=אדום, לא רלוונטי=אפור, אחר/ריק=ניטרלי.
export function reportTone(s) {
  const t = str(s);
  if (!t) return "none";
  if (/לא רלוונטי/.test(t)) return "mut";
  if (/חסר|לא נמצא/.test(t)) return "bad";
  if (/נמצא/.test(t)) return "ok";
  return "none";
}
