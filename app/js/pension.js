// Family OS — מסך "🛡️ פנסיה וביטוח" (Family_OS_Pension_Tracker_Brief.md). ללירן בלבד.
//
// פרטיות — אותם כללים בדיוק כמו "שוק ההון" (market.js):
//  • הנתונים נשמרים רק במשתנה המודול הזה (זיכרון). לא ל-Firestore, לא ל-IndexedDB/localStorage, לא ל-cache,
//    לא ל-console. נמחקים ביציאה ממסך הפיננסים ובהתנתקות (clearPensionData).
//  • נקראים ישירות מ-Google (Sheets API) עם טוקן drive.file הקיים — לא עוברים בשום שרת שלנו.
//  • מה שנשמר מקומית הוא רק מזהה+שם הגיליון (drive.js, setMeta = IndexedDB מקומי).
//  • אין כאן סכומים, והטווחים הנקראים הם רק הלשוניות "מעקב" ו"מרשם" (pension-parse.js).
// כתיבה (אושרה ע"י לירן ב-2026-10-18): רק שינוי סטטוס והערות, ורק לעמודות "סטטוס"/"הערות"/"עודכן" של שורה אחת לפי "מזהה"
// (planWrite ב-pension-parse.js). לפני כל כתיבה קוראים את לשונית "מעקב" מחדש; אם מה ששינינו כבר הוחלף בגיליון — הגיליון
// מנצח (לא כותבים, מרעננים ומודיעים). אותו טוקן drive.file, בלי scope חדש. שום דבר אחר לא נכתב: לא הוספה/מחיקה של שורות.
// בכל כרטיס יש גם קישור "פתח בגיליון".
// הסתרת הטאב ממי שאינו לירן היא נוחות בלבד; ההגנה האמיתית היא ש-Google לא ייתן לחשבון אחר לקרוא את הקובץ.

import { esc } from "./constants.js";
import { currentUser } from "./auth.js";
import { showScreen } from "./nav.js";
import { getPensionSheetId, requestToken, invalidateToken } from "./drive.js";
import { classifyApiError, isMissingTabError } from "./market-parse.js";
import {
  isPensionUser, PENSION_TABS, pensionRangeFor, parseBatch, computeMetrics, applyFilters, distinct,
  groupByPriority, snapshotByOwner, reportTone, PEOPLE_ORDER, DOC_TYPE, ST_DONE, ST_IRRELEVANT, ST_WAITING,
  STATUSES, NOTES_MAX, planWrite, todayDmy, parseDmy,
} from "./pension-parse.js";

export const canSeePension = () => isPensionUser(currentUser());

const freshState = () => ({ loading: false, kind: null, data: null, refreshFailed: false, httpCode: 0 });
let st = freshState();
let filters = { person: "", type: "", domain: "" };
let showDone = false;
let openGroups = new Set(["p:דחוף"]); // "דחוף" פתוח כברירת מחדל; השאר סגורים
let openDetails = new Set();
// מצב עריכה (זיכרון בלבד): איזו שורה בכתיבה כרגע, איזו בעריכת הערות (וטיוטת הטקסט), והודעת תוצאה פר-שורה.
let writingId = null;
let editingNotesId = null;
let notesDraft = "";
let flash = {}; // id -> {text, err}
let rerender = () => {};
export function setPensionRerender(fn) { rerender = fn; }

function resetView() {
  filters = { person: "", type: "", domain: "" };
  showDone = false;
  openGroups = new Set(["p:דחוף"]);
  openDetails = new Set();
  writingId = null;
  editingNotesId = null;
  notesDraft = "";
  flash = {};
}

export function clearPensionData() {
  st = freshState();
  resetView();
  const el = document.getElementById("pensionBody");
  if (el) el.innerHTML = ""; // גם ה-DOM — אחרת הנתונים נשארים בטקסט של אלמנט מוסתר
}

// ---- רשת ----

const API = "https://sheets.googleapis.com/v4/spreadsheets";

async function call(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

async function fetchSheet(token, retried = false) {
  const id = encodeURIComponent(getPensionSheetId());
  // תאריכים בגיליון הם טקסט dd/mm/yyyy, ולכן UNFORMATTED_VALUE משאיר אותם כמו שהם.
  const batchUrl = (tabs) =>
    `${API}/${id}/values:batchGet?${tabs.map((t) => `ranges=${encodeURIComponent(pensionRangeFor(t))}`).join("&")}` +
    `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  try {
    let tabs = PENSION_TABS;
    let res = await call(batchUrl(tabs), token);
    if (isMissingTabError(res.status, res.text)) {
      // לשונית חסרה: קוראים שוב רק את הקיימות; החסרה תציג "המבנה של הגיליון השתנה" במקטע שלה בלבד.
      const meta = await call(`${API}/${id}?fields=sheets.properties.title`, token);
      if (meta.ok) {
        const titles = (JSON.parse(meta.text).sheets || []).map((s) => s.properties && s.properties.title);
        tabs = PENSION_TABS.filter((t) => titles.includes(t.title));
        res = tabs.length ? await call(batchUrl(tabs), token) : { ok: true, status: 200, text: '{"valueRanges":[]}' };
      } else res = meta;
    }
    if (res.status === 401 && !retried) {
      invalidateToken();
      const started = requestToken((t) => fetchSheet(t, true), () => applyFetchFailure(401, ""));
      if (!started) applyFetchFailure(401, "");
      return;
    }
    if (res.ok) applyBatchResponse(JSON.parse(res.text), tabs.map((t) => t.key));
    else applyFetchFailure(res.status, res.text);
  } catch (_) {
    applyFetchFailure(0, "");
  }
}

// ---- מצב ----

export function applyBatchResponse(json, tabKeys) {
  st = { loading: false, kind: null, data: parseBatch(json, tabKeys), refreshFailed: false, httpCode: 0 };
  rerender();
}

export function applyFetchFailure(status, bodyText) {
  const kind = classifyApiError(status, bodyText);
  if (st.data && (kind === "network" || kind === "auth")) {
    st = { ...st, loading: false, refreshFailed: true }; // הנתונים האחרונים שבזיכרון נשארים מוצגים
  } else {
    st = { ...st, loading: false, kind: kind === "auth" ? "needToken" : kind, httpCode: status }; // קוד בלבד, בלי גוף התגובה
  }
  rerender();
}

export function refreshPension() {
  if (!canSeePension()) return;
  if (!getPensionSheetId()) { st = { ...st, kind: "noSheet", loading: false }; rerender(); return; }
  st = { ...st, loading: true, kind: null };
  flash = {}; // ריענון יזום — הודעות הכתיבה הקודמות כבר לא רלוונטיות
  rerender();
  const onFail = () => {
    st = st.data ? { ...st, loading: false, refreshFailed: true } : { ...st, loading: false, kind: "needToken" };
    rerender();
  };
  if (!requestToken((t) => fetchSheet(t), onFail)) onFail();
}

// ---- כתיבה (סטטוס/הערות בלבד) ----

const WRITE_ERR = {
  structure: "המבנה של הגיליון השתנה — לא כתבתי.",
  notFound: "השורה לא נמצאה בגיליון (נמחקה או שהמזהה שונה) — לא כתבתי.",
  duplicate: "המזהה מופיע בגיליון יותר מפעם אחת — לא כתבתי.",
  invalid: "הערך לא תקין — לא כתבתי.",
  conflict: "השורה עודכנה בגיליון בינתיים — לא דרסתי, רעננתי את הנתונים. נסו שוב.",
  network: "לא הצלחתי לשמור (בעיית רשת). נסו שוב.",
  needToken: "צריך להתחבר ל-Google Drive כדי לשמור.",
};

function endWrite(id, text, err) {
  writingId = null;
  flash = { ...flash, [id]: { text, err: !!err } };
  rerender();
}
const httpErr = (status) => (status === 403 || status === 404 ? `אין הרשאה לכתוב לגיליון (${status}) — בחרו אותו מחדש בהגדרות.` : `לא הצלחתי לשמור (${status}).`);

// changes = {status?, notes?}. קריאה מחדש של "מעקב" -> planWrite (הגיליון מנצח) -> batchUpdate ל-3 תאים לכל היותר.
export function saveChange(id, changes) {
  if (writingId || !canSeePension() || !getPensionSheetId() || !st.data || !st.data.tracking) return;
  const row = st.data.tracking.find((r) => r.id === id);
  if (!row) return;
  const baseline = { status: row.status, notes: row.notes };
  writingId = id;
  flash = { ...flash, [id]: undefined };
  rerender();
  const started = requestToken((t) => doWrite(t, id, changes, row, baseline, false), () => endWrite(id, WRITE_ERR.needToken, true));
  if (!started) endWrite(id, WRITE_ERR.needToken, true);
}

async function doWrite(token, id, changes, row, baseline, retried) {
  try {
    const sid = encodeURIComponent(getPensionSheetId());
    const tab = PENSION_TABS[0];
    const read = await call(
      `${API}/${sid}/values/${encodeURIComponent(pensionRangeFor(tab))}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
      token
    );
    if (read.status === 401 && !retried) {
      invalidateToken();
      if (!requestToken((t) => doWrite(t, id, changes, row, baseline, true), () => endWrite(id, WRITE_ERR.needToken, true))) endWrite(id, WRITE_ERR.needToken, true);
      return;
    }
    if (!read.ok) return endWrite(id, httpErr(read.status), true);
    const plan = planWrite(JSON.parse(read.text).values || [], id, changes, baseline, todayDmy());
    if (!plan.ok) {
      endWrite(id, WRITE_ERR[plan.reason] || WRITE_ERR.invalid, true);
      if (plan.reason === "conflict") fetchSheet(token, true); // מרעננים כדי שיוצג מה שבגיליון
      return;
    }
    if (plan.updates.length) {
      const w = await fetch(`${API}/${sid}/values:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        // RAW: המחרוזת נכתבת כמו שהיא (תאריך dd/mm/yyyy נשאר טקסט, לא מומר למספר תאריך).
        body: JSON.stringify({ valueInputOption: "RAW", data: plan.updates.map((u) => ({ range: u.range, values: [[u.value]] })) }),
      });
      if (!w.ok) return endWrite(id, httpErr(w.status), true);
    }
    // מעדכנים את הזיכרון לפי מה שנכתב (בלי קריאה נוספת)
    if ("status" in changes) row.status = changes.status;
    if ("notes" in changes) row.notes = String(changes.notes).trim();
    if (plan.updates.length) row.updated = parseDmy(todayDmy());
    if ("notes" in changes) { editingNotesId = null; notesDraft = ""; }
    endWrite(id, plan.updates.length ? "נשמר בגיליון ✓" : "ללא שינוי", false);
  } catch (_) {
    endWrite(id, WRITE_ERR.network, true);
  }
}

// ---- רינדור ----

const STRUCT = `<div class="log-empty" style="margin:0">המבנה של הגיליון השתנה — המקטע הזה לא נקרא.</div>`;
const section = (title, body, extra = "") => `<section class="mk-section"><h3>${title}${extra}</h3>${body}</section>`;
const personTag = (p) => (p ? `<span class="mk-tag mk-tag-info">${esc(p)}</span>` : "");

const STATUS_PILL = { "פתוח": "pill-warn", "בטיפול": "pill-warn", [ST_WAITING]: "pill-mut", [ST_DONE]: "pill-ok", [ST_IRRELEVANT]: "pill-mut" };
const statusPill = (s) => `<span class="pill ${STATUS_PILL[s] || "pill-mut"}">${esc(s)}</span>`;

function metrics(m) {
  const k = (label, v, cls = "") => `<div class="mk-metric"><div class="fc-k">${label}</div><div class="mk-v ${cls}">${v}</div></div>`;
  return `<div class="mk-metrics">
      ${k("פתוחים", m.open)}
      ${k("דחופים פתוחים", m.urgentOpen, m.urgentOpen ? "mk-neg" : "")}
      ${k("ממתינים לתשובה", m.waiting)}
      ${k("הושגו", m.done, m.done ? "mk-pos" : "")}
    </div>
    <div class="pn-progress">
      <div class="mk-sub" style="margin:0 0 4px">הושגו ${m.done} מתוך ${m.base}${m.irrelevant ? ` (לא כולל ${m.irrelevant} לא רלוונטיים)` : ""} · ${m.progressPct}%</div>
      <div class="progress-track"><div class="progress-fill" style="width:${m.progressPct}%"></div></div>
    </div>`;
}

function filtersBar(rows) {
  const opts = (key, label, order) => {
    let vals = distinct(rows, key);
    if (order) vals = [...order.filter((v) => vals.includes(v)), ...vals.filter((v) => !order.includes(v))];
    return `<label class="pn-filter"><span>${label}</span><select data-pn-filter="${key}">
      <option value="">הכול</option>${vals.map((v) => `<option value="${esc(v)}" ${filters[key] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}
    </select></label>`;
  };
  return `<div class="pn-filters">
      ${opts("person", "אדם", PEOPLE_ORDER)}${opts("type", "סוג")}${opts("domain", "תחום")}
      <label class="pn-toggle"><input type="checkbox" id="pnShowDone" ${showDone ? "checked" : ""}> הצג גם הושגו / לא רלוונטי</label>
    </div>`;
}

function card(r, sheetUrl) {
  const open = openDetails.has(r.id);
  const busy = writingId !== null;
  const metaBits = [r.type, r.domain].filter(Boolean).map((t) => `<span class="mk-tag mk-tag-info">${esc(t)}</span>`).join("");
  const details = [
    r.why ? `<div><b>למה חשוב:</b> ${esc(r.why)}</div>` : "",
    r.lead ? `<div><b>מוביל:</b> ${esc(r.lead)}</div>` : "",
    r.source ? `<div><b>מקור:</b> ${esc(r.source)}</div>` : "",
    r.opened || r.updated ? `<div>${r.opened ? `נפתח ${esc(r.opened.text)}` : ""}${r.opened && r.updated ? " · " : ""}${r.updated ? `עודכן ${esc(r.updated.text)}` : ""}</div>` : "",
  ].join("");
  return `<div class="mk-card pn-card">
    <div class="mk-card-top"><div class="mk-name">${esc(r.product || "(ללא מוצר)")}</div><div class="mk-badges">${personTag(r.person)}${statusPill(r.status)}</div></div>
    ${metaBits ? `<div class="pn-tags">${metaBits}</div>` : ""}
    ${r.finding ? `<div class="pn-finding">${esc(r.finding)}</div>` : ""}
    ${r.next ? `<div class="pn-next"><span class="pn-next-k">הצעד הבא</span>${esc(r.next)}</div>` : ""}
    ${editingNotesId === r.id
      ? `<div class="pn-notes-edit">
          <textarea class="pn-notes-input" data-pn-notes-input maxlength="${NOTES_MAX}" ${busy ? "disabled" : ""} placeholder="הערות">${esc(notesDraft)}</textarea>
          <div class="pn-notes-actions">
            <button type="button" class="btn-primary" data-pn-notes-save="${esc(r.id)}" ${busy ? "disabled" : ""}>שמירה</button>
            <button type="button" class="btn-secondary" data-pn-notes-cancel ${busy ? "disabled" : ""}>ביטול</button>
          </div></div>`
      : r.notes ? `<div class="mk-note"><b>הערות:</b> ${esc(r.notes)}</div>` : ""}
    ${open && details ? `<div class="pn-details">${details}</div>` : ""}
    <div class="pn-edit">
      <label class="pn-filter"><span>סטטוס</span><select data-pn-status="${esc(r.id)}" ${busy ? "disabled" : ""}>
        ${(STATUSES.includes(r.status) ? STATUSES : [r.status, ...STATUSES]).map((s) => `<option value="${esc(s)}" ${s === r.status ? "selected" : ""}>${esc(s)}</option>`).join("")}
      </select></label>
      ${editingNotesId === r.id ? "" : `<button type="button" class="icon-edit-btn" data-pn-notes="${esc(r.id)}" ${busy ? "disabled" : ""}>${r.notes ? "✎ עריכת הערות" : "+ הערות"}</button>`}
      ${writingId === r.id ? `<span class="mk-sub">שומר…</span>` : ""}
      ${flash[r.id] ? `<span class="${flash[r.id].err ? "field-error pn-flash" : "mk-sub pn-flash-ok"}">${esc(flash[r.id].text)}</span>` : ""}
    </div>
    <div class="pn-foot">
      ${details ? `<button type="button" class="icon-edit-btn" data-pn-details="${esc(r.id)}">${open ? "▾ פחות" : "⋯ פרטים"}</button>` : ""}
      <a class="icon-edit-btn" href="${sheetUrl}" target="_blank" rel="noopener noreferrer">פתח בגיליון</a>
      <span class="mk-sub pn-id">${esc(r.id)}</span>
    </div>
  </div>`;
}

function accordion(key, title, items, sheetUrl) {
  const isOpen = openGroups.has(key);
  return `<div class="cat-accordion">
    <button type="button" class="cat-accordion-head ${isOpen ? "open" : ""}" data-pn-group="${esc(key)}">
      <span class="cat-arrow">▸</span><span>${title}</span><span class="cat-count">${items.length}</span>
    </button>
    <div class="cat-accordion-body ${isOpen ? "open" : ""}"><div class="mk-cards pn-cards">${items.map((r) => card(r, sheetUrl)).join("")}</div></div>
  </div>`;
}

function listSection(tracking, sheetUrl) {
  const filtered = applyFilters(tracking, filters).filter((r) => r.type !== DOC_TYPE);
  const isActive = (r) => r.status !== ST_DONE && r.status !== ST_IRRELEVANT;
  const active = filtered.filter(isActive);
  const groups = groupByPriority(active);
  let body = groups.length
    ? groups.map((g) => accordion(`p:${g.priority}`, esc(g.priority), g.items, sheetUrl)).join("")
    : `<div class="log-empty" style="margin:0">אין פריטים פתוחים לפי המסננים.</div>`;
  if (showDone) {
    const done = filtered.filter((r) => r.status === ST_DONE);
    const irr = filtered.filter((r) => r.status === ST_IRRELEVANT);
    if (done.length) body += accordion("done", "✓ הושגו", done, sheetUrl);
    if (irr.length) body += accordion("irrelevant", "לא רלוונטי", irr, sheetUrl);
  }
  return section("📋 רשימת המעקב", filtersBar(tracking) + body);
}

function docsSection(tracking) {
  const docs = applyFilters(tracking, filters).filter((r) => r.type === DOC_TYPE && (showDone || r.status !== ST_IRRELEVANT));
  if (!docs.length) return "";
  const base = docs.filter((r) => r.status !== ST_IRRELEVANT);
  const got = base.filter((r) => r.status === ST_DONE).length;
  const items = docs
    .map((r) => `<li class="pn-doc ${r.status === ST_DONE ? "done" : ""}">
      <input type="checkbox" data-pn-doc="${esc(r.id)}" ${r.status === ST_DONE ? "checked" : ""} ${writingId !== null || r.status === ST_IRRELEVANT ? "disabled" : ""} aria-label="${esc(r.product || r.id)}">
      <div><div class="pn-doc-name">${esc(r.product || "(ללא מוצר)")} ${personTag(r.person)}${r.status === ST_IRRELEVANT ? statusPill(r.status) : ""}</div>
        ${r.next ? `<div class="mk-sub">${esc(r.next)}</div>` : ""}
        ${writingId === r.id ? `<div class="mk-sub">שומר…</div>` : ""}
        ${flash[r.id] ? `<div class="${flash[r.id].err ? "field-error pn-flash" : "mk-sub pn-flash-ok"}">${esc(flash[r.id].text)}</div>` : ""}</div>
    </li>`)
    .join("");
  return section("📄 מסמכים להורדה", `<ul class="pn-docs">${items}</ul><div class="mk-sub">סימון מעדכן את הסטטוס ל"הושג" בגיליון; ביטול הסימון מחזיר ל"פתוח".</div>`,
    ` <span class="cat-count">${got}/${base.length}</span>`);
}

function snapshotSection(registry) {
  if (!registry) return section("🧾 תמונת מצב", STRUCT);
  if (!registry.length) return section("🧾 תמונת מצב", `<div class="log-empty" style="margin:0">המרשם ריק.</div>`);
  const cards = snapshotByOwner(registry)
    .map((o) => `<div class="mk-card pn-owner">
      <div class="mk-name">${o.owner === "בעלים לא ברור" ? "❓ " : "👤 "}${esc(o.owner)}</div>
      ${o.categories.map((c) => `<div class="pn-cat"><div class="pn-cat-name">${esc(c.category)}</div>
        ${c.items.map((p) => `<div class="pn-prod"><span class="pn-prod-name">${esc(p.name)}${p.type ? ` <span class="mk-sub">· ${esc(p.type)}</span>` : ""}</span>
          <span class="mk-tag pn-rep-${reportTone(p.reportStatus)}">${esc(p.reportStatus || "—")}</span></div>`).join("")}
      </div>`).join("")}
    </div>`)
    .join("");
  return section("🧾 תמונת מצב", `<div class="mk-cards pn-owners">${cards}</div><div class="mk-sub" style="margin-top:6px">סטטוס דוח 2025 מתוך המרשם — קריאה בלבד.</div>`);
}

export function renderPension() {
  const el = document.getElementById("pensionBody");
  if (!el || !canSeePension()) return;
  const msg = (text, btn) => `<div class="log-empty" style="margin-bottom:10px">${text}</div>${btn || ""}`;
  let html;

  if (st.kind === "noSheet" || (!st.data && !getPensionSheetId())) {
    html = msg("בוחרים את גיליון \"מרשם קופות ופוליסות\" פעם אחת בהגדרות ›", `<button class="btn-primary" id="pnGoSettings">למסך ההגדרות</button>`);
  } else if (st.kind === "needToken") {
    html = msg("צריך להתחבר ל-Google Drive כדי לקרוא את הגיליון.", `<button class="btn-primary" id="pnConnect">התחברות ל-Google Drive</button>`);
  } else if (st.kind === "apiDisabled") {
    html = msg("צריך להפעיל את Google Sheets API בפרויקט הענן.", `<button class="icon-edit-btn" id="pnRetry">↻ נסה שוב</button>`);
  } else if (st.kind === "sheetUnreadable") {
    html = msg(`לא הצלחתי לקרוא את הגיליון${st.httpCode ? ` (${Number(st.httpCode)})` : ""}. בחרו אותו מחדש בהגדרות.`, `<button class="btn-primary" id="pnGoSettings">למסך ההגדרות</button>`);
  } else if (st.kind === "network" && !st.data) {
    html = msg("לא הצלחתי לרענן.", `<button class="icon-edit-btn" id="pnRetry">↻ נסה שוב</button>`);
  } else if (!st.data) {
    html = msg(st.loading ? "טוען…" : "לחצו על רענון כדי לטעון את הנתונים.", st.loading ? "" : `<button class="icon-edit-btn" id="pnRetry">↻ רענון</button>`);
  } else {
    const d = st.data;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(getPensionSheetId() || "")}/edit`;
    const m = d.tracking ? computeMetrics(d.tracking) : null;
    html = `
      <div class="mk-statusbar">
        <span class="mk-sub">עודכן לאחרונה בגיליון: ${m && m.updatedText ? esc(m.updatedText) : "—"}${st.loading ? " · מרענן…" : ""}</span>
        <span class="mk-actions"><button class="icon-edit-btn" id="pnRetry">↻ רענון</button>
        <a class="icon-edit-btn" href="${sheetUrl}" target="_blank" rel="noopener noreferrer">פתח בגיליון</a></span>
      </div>
      ${st.refreshFailed ? `<div class="field-error" style="margin-bottom:10px">לא הצלחתי לרענן — מוצגים הנתונים האחרונים שנטענו.</div>` : ""}
      ${d.tracking ? metrics(m) + listSection(d.tracking, sheetUrl) + docsSection(d.tracking) : section("📋 מעקב", STRUCT)}
      ${snapshotSection(d.registry)}
      <p class="footer-note">הנתונים נקראים ישירות מהגיליון ולא נשמרים באפליקציה. מכאן אפשר לעדכן רק סטטוס והערות; הוספה ומחיקה של שורות — בגיליון.</p>`;
  }

  el.innerHTML = html;
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener("click", fn); };
  on("pnRetry", refreshPension);
  on("pnConnect", refreshPension);
  on("pnGoSettings", () => showScreen("settings"));
  const toggleIn = (set, key) => { if (set.has(key)) set.delete(key); else set.add(key); renderPension(); };
  el.querySelectorAll("[data-pn-group]").forEach((b) => b.addEventListener("click", () => toggleIn(openGroups, b.dataset.pnGroup)));
  el.querySelectorAll("[data-pn-details]").forEach((b) => b.addEventListener("click", () => toggleIn(openDetails, b.dataset.pnDetails)));
  el.querySelectorAll("[data-pn-filter]").forEach((s) =>
    s.addEventListener("change", () => { filters = { ...filters, [s.dataset.pnFilter]: s.value }; renderPension(); })
  );
  // כתיבה: סטטוס (בחירה), צ'קליסט מסמכים (סימון = הושג, ביטול = פתוח), הערות (עריכה + שמירה).
  el.querySelectorAll("[data-pn-status]").forEach((s) =>
    s.addEventListener("change", () => saveChange(s.dataset.pnStatus, { status: s.value }))
  );
  el.querySelectorAll("[data-pn-doc]").forEach((c) =>
    c.addEventListener("change", () => saveChange(c.dataset.pnDoc, { status: c.checked ? ST_DONE : "פתוח" }))
  );
  el.querySelectorAll("[data-pn-notes]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = st.data.tracking.find((x) => x.id === b.dataset.pnNotes);
      editingNotesId = b.dataset.pnNotes;
      notesDraft = r ? r.notes : "";
      flash = { ...flash, [editingNotesId]: undefined };
      renderPension();
      const ta = el.querySelector("[data-pn-notes-input]");
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    })
  );
  const ta = el.querySelector("[data-pn-notes-input]");
  if (ta) ta.addEventListener("input", () => { notesDraft = ta.value; }); // הטיוטה שורדת רינדור מחדש
  el.querySelectorAll("[data-pn-notes-cancel]").forEach((b) =>
    b.addEventListener("click", () => { editingNotesId = null; notesDraft = ""; renderPension(); })
  );
  el.querySelectorAll("[data-pn-notes-save]").forEach((b) =>
    b.addEventListener("click", () => saveChange(b.dataset.pnNotesSave, { notes: notesDraft }))
  );
  const sd = document.getElementById("pnShowDone");
  if (sd) sd.addEventListener("change", () => { showDone = sd.checked; renderPension(); });
}
