// Family OS — מסך "📈 שוק ההון" (Family_OS_Market_Brief.md). ללירן בלבד, קריאה בלבד.
//
// פרטיות — כללים קשיחים של המסך הזה:
//  • נתוני התיק נשמרים רק במשתנה המודול הזה (זיכרון). לא ל-Firestore, לא ל-IndexedDB/localStorage, לא ל-cache,
//    לא ל-console. הם נמחקים ביציאה ממסך הפיננסים ובהתנתקות (clearMarketData).
//  • הנתונים נקראים ישירות מ-Google (Sheets API) עם טוקן drive.file הקיים — לא עוברים בשום שרת שלנו.
//  • מה שנשמר מקומית הוא רק מזהה+שם הגיליון (drive.js, setMeta = IndexedDB מקומי).
// הסתרת הטאב ממי שאינו לירן היא נוחות בלבד; ההגנה האמיתית היא ש-Google לא ייתן לחשבון אחר לקרוא את הקובץ.

import { esc } from "./constants.js";
import { currentUser } from "./auth.js";
import { showScreen } from "./nav.js";
import { getMarketSheetId, requestToken, invalidateToken } from "./drive.js";
import {
  isMarketUser, MARKET_TABS, rangeFor, parseBatch, classifyApiError, isMissingTabError, num,
} from "./market-parse.js";

export const canSeeMarket = () => isMarketUser(currentUser());

let st = { loading: false, kind: null, data: null, refreshFailed: false };
let targetsView = "type"; // "type" | "security"
let rerender = () => {};
export function setMarketRerender(fn) { rerender = fn; }

export function clearMarketData() {
  st = { loading: false, kind: null, data: null, refreshFailed: false };
  targetsView = "type";
  const el = document.getElementById("marketBody");
  if (el) el.innerHTML = ""; // גם ה-DOM — אחרת נתוני התיק נשארים בטקסט של אלמנט מוסתר
}

// ---- רשת ----

const API = "https://sheets.googleapis.com/v4/spreadsheets";

async function call(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

async function fetchSheet(token, retried = false) {
  const id = encodeURIComponent(getMarketSheetId());
  const batchUrl = (tabs) =>
    `${API}/${id}/values:batchGet?${tabs.map((t) => `ranges=${encodeURIComponent(rangeFor(t))}`).join("&")}` +
    `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  try {
    let tabs = MARKET_TABS;
    let res = await call(batchUrl(tabs), token);
    if (isMissingTabError(res.status, res.text)) {
      // לשונית חסרה: קוראים שוב רק את הקיימות; הלשונית החסרה תציג "המבנה של הגיליון השתנה" במקטע שלה בלבד.
      const meta = await call(`${API}/${id}?fields=sheets.properties.title`, token);
      if (meta.ok) {
        const titles = (JSON.parse(meta.text).sheets || []).map((s) => s.properties && s.properties.title);
        tabs = MARKET_TABS.filter((t) => titles.includes(t.title));
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
  st = { loading: false, kind: null, data: parseBatch(json, tabKeys), refreshFailed: false };
  rerender();
}

export function applyFetchFailure(status, bodyText) {
  const kind = classifyApiError(status, bodyText);
  if (st.data && (kind === "network" || kind === "auth")) {
    st = { ...st, loading: false, refreshFailed: true }; // הנתונים האחרונים שבזיכרון נשארים מוצגים
  } else {
    st = { ...st, loading: false, kind: kind === "auth" ? "needToken" : kind };
  }
  rerender();
}

export function refreshMarket() {
  if (!canSeeMarket()) return;
  if (!getMarketSheetId()) { st = { ...st, kind: "noSheet", loading: false }; rerender(); return; }
  st = { ...st, loading: true, kind: null };
  rerender();
  const onFail = () => {
    st = st.data ? { ...st, loading: false, refreshFailed: true } : { ...st, loading: false, kind: "needToken" };
    rerender();
  };
  if (!requestToken((t) => fetchSheet(t), onFail)) onFail();
}

// ---- עיצוב ערכים (תמיד LTR בתוך הטקסט העברי, כדי שסימן +/− לא יקפוץ) ----

const dash = "—";
const ltr = (s) => `<bdi dir="ltr">${s}</bdi>`;
const signCls = (n) => (n == null ? "" : n > 0 ? "mk-pos" : n < 0 ? "mk-neg" : "");
function ils(n, { sign = false } = {}) {
  if (n == null) return dash;
  const body = `₪${Math.abs(Math.round(n)).toLocaleString("he-IL")}`;
  return ltr(sign ? `${n > 0 ? "+" : n < 0 ? "−" : ""}${body}` : (n < 0 ? "−" : "") + body);
}
function pct(f, { sign = false, digits = 1 } = {}) {
  if (f == null) return dash;
  const v = (f * 100).toFixed(digits);
  return ltr(`${sign && f > 0 ? "+" : f < 0 ? "−" : ""}${Math.abs(Number(v)).toFixed(digits)}%`);
}
const SYM = { USD: "$", EUR: "€", ILS: "₪", GBP: "£" };
function price(n, cur) {
  if (n == null) return dash;
  const s = n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return ltr(SYM[cur] ? `${SYM[cur]}${s}` : `${s}${cur ? " " + esc(cur) : ""}`);
}
const bigNum = (n) => {
  if (n == null) return dash;
  const a = Math.abs(n);
  return ltr(a >= 1e12 ? (n / 1e12).toFixed(2) + "T" : a >= 1e9 ? (n / 1e9).toFixed(1) + "B" : a >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n).toLocaleString("he-IL"));
};
const plain = (n, d = 1) => (n == null ? dash : ltr(n.toFixed(d)));

// פס מיקום בטווח 52 שבועות
function rangeBar(p, low, high) {
  if (p == null || low == null || high == null || high <= low) return "";
  const pos = Math.max(0, Math.min(1, (p - low) / (high - low))) * 100;
  return `<div class="mk-range" title="טווח 52 שבועות"><div class="mk-range-dot" style="inset-inline-start:${pos.toFixed(1)}%"></div></div>`;
}

// ---- מקטעים ----

const STRUCT = `<div class="log-empty" style="margin:0">המבנה של הגיליון השתנה — המקטע הזה לא נקרא.</div>`;
const section = (title, body) => `<section class="mk-section"><h3>${title}</h3>${body}</section>`;

function metrics(s) {
  const m = (k, v, sub, cls = "") => `<div class="mk-metric"><div class="fc-k">${k}</div><div class="mk-v ${cls}">${v}</div>${sub ? `<div class="mk-sub">${sub}</div>` : ""}</div>`;
  return `<div class="mk-metrics">
    ${m("שווי השקעות", ils(s.value), `עלות ${ils(s.cost)}`)}
    ${m("רווח/הפסד", ils(s.pl, { sign: true }), pct(s.plPct, { sign: true }), signCls(s.pl))}
    ${m("שינוי היום", ils(s.day, { sign: true }), pct(s.dayPct, { sign: true }), signCls(s.day))}
    ${m("כספית ומזומן", ils(s.liquid), `סה״כ כולל נזיל ${ils(s.total)}`)}
  </div>`;
}

function targetTag(r, investValue, held) {
  const tag = (cls, t) => `<span class="mk-tag ${cls}">${t}</span>`;
  const notHeld = !held ? tag("mk-tag-info", "עוד לא נקנה") : "";
  if (r.gap == null) return notHeld;
  const near = investValue ? Math.abs(r.gap) < investValue * 0.01 : r.gap === 0;
  if (near) return notHeld + tag("mk-tag-ok", "ביעד");
  return notHeld + (r.gap > 0 ? tag("mk-tag-short", `חסר ${ils(r.gap)}`) : tag("mk-tag-over", `עודף ${ils(-r.gap)}`));
}

function targetsSection(t, investValue) {
  if (!t) return section("🎯 יעד מול ביצוע", STRUCT);
  const rows = targetsView === "type" ? t.byType : t.bySecurity;
  const toggle = `<div class="store-tabs">
      <button class="store-tab ${targetsView === "type" ? "active" : ""}" data-mk-targets="type">לפי סוג</button>
      <button class="store-tab ${targetsView === "security" ? "active" : ""}" data-mk-targets="security">לפי נייר</button>
    </div>`;
  if (!rows) return section("🎯 יעד מול ביצוע", toggle + STRUCT);
  const scale = Math.max(0.05, ...rows.map((r) => Math.max(r.targetPct ?? 0, r.actualPct ?? 0))) * 1.15;
  const body = rows.length
    ? rows
        .map((r) => {
          const held = (r.actual ?? 0) !== 0;
          const w = (((r.actualPct ?? 0) / scale) * 100).toFixed(1);
          const tp = r.targetPct == null ? null : ((r.targetPct / scale) * 100).toFixed(1);
          return `<div class="mk-trow">
            <div class="mk-trow-head"><span class="mk-tname">${esc(r.name)}</span><span>${targetTag(r, investValue, targetsView === "type" ? true : held)}</span></div>
            <div class="mk-bar"><div class="mk-bar-fill" style="width:${w}%"></div>${tp != null ? `<div class="mk-bar-target" style="inset-inline-start:${tp}%"></div>` : ""}</div>
            <div class="mk-sub">בפועל ${pct(r.actualPct)} (${ils(r.actual)}) · יעד ${pct(r.targetPct)} (${ils(r.target)})</div>
          </div>`;
        })
        .join("")
    : `<div class="log-empty" style="margin:0">אין שורות להצגה.</div>`;
  return section("🎯 יעד מול ביצוע", toggle + body);
}

function badges(h) {
  return (h.priceSource === "ידני" ? `<span class="mk-tag mk-tag-info">ידני</span>` : "") +
    (h.priceSource === "לא נמצא" ? `<span class="mk-tag mk-tag-short">לא נמצא ב-Google</span>` : "");
}

function holdingsSection(h) {
  if (!h) return section("📊 ההשקעות שלי", STRUCT);
  if (!h.investments.length) return section("📊 ההשקעות שלי", `<div class="log-empty" style="margin:0">אין ניירות להצגה.</div>`);
  const cards = h.investments
    .map((i) => `<div class="mk-card">
      <div class="mk-card-top"><div><div class="mk-name">${esc(i.name)}</div><div class="mk-sub">${esc([i.symbol || i.secId, i.type].filter(Boolean).join(" · "))}</div></div>
        <div class="mk-badges">${badges(i)}</div></div>
      <div class="mk-card-row"><span>${price(i.price, i.currency)}</span><span class="${signCls(i.dayPct)}">${pct(i.dayPct, { sign: true })} היום</span></div>
      <div class="mk-card-row"><span class="mk-strong">${ils(i.value)}</span><span class="${signCls(i.pl)}">${ils(i.pl, { sign: true })} (${pct(i.plPct, { sign: true })})</span></div>
      <div class="mk-sub">משקל ${pct(i.weight)}</div>
      ${rangeBar(i.price, i.low, i.high)}
    </div>`)
    .join("");
  const table = `<div class="table-wrap mk-table-wrap"><table class="mk-table"><thead><tr>
      <th>נייר</th><th>סוג</th><th>מחיר</th><th>שינוי יומי</th><th>שווי</th><th>רווח/הפסד</th><th>%</th><th>משקל</th><th>52 שבועות</th></tr></thead><tbody>
    ${h.investments
      .map((i) => `<tr><td>${esc(i.name)} ${badges(i)}<div class="mk-sub">${esc(i.symbol || i.secId)}</div></td><td>${esc(i.type)}</td><td>${price(i.price, i.currency)}</td>
        <td class="${signCls(i.dayPct)}">${pct(i.dayPct, { sign: true })}</td><td class="mk-strong">${ils(i.value)}</td>
        <td class="${signCls(i.pl)}">${ils(i.pl, { sign: true })}</td><td class="${signCls(i.plPct)}">${pct(i.plPct, { sign: true })}</td><td>${pct(i.weight)}</td>
        <td style="min-width:110px">${rangeBar(i.price, i.low, i.high) || dash}</td></tr>`)
      .join("")}</tbody></table></div>`;
  return section("📊 ההשקעות שלי", `<div class="mk-cards">${cards}</div>${table}`);
}

function liquidSection(h) {
  if (!h) return section("💵 כספית ומזומן", STRUCT);
  if (!h.liquid.length) return "";
  return section(
    "💵 כספית ומזומן",
    `<div class="mk-cards mk-cards-small">${h.liquid
      .map((l) => `<div class="mk-card"><div class="mk-name">${esc(l.name)}</div><div class="mk-strong">${ils(l.value)}</div>
        ${l.cost ? `<div class="mk-sub ${signCls(l.pl)}">${ils(l.pl, { sign: true })}</div>` : ""}</div>`)
      .join("")}</div>`
  );
}

function watchSection(w) {
  if (!w) return section("👁️ רשימת מעקב", STRUCT);
  if (!w.length) return section("👁️ רשימת מעקב", `<div class="log-empty" style="margin:0">הרשימה ריקה.</div>`);
  return section(
    "👁️ רשימת מעקב",
    `<div class="mk-cards">${w
      .map((x) => `<div class="mk-card">
        <div class="mk-card-top"><div><div class="mk-name">${esc(x.name || x.symbol)}</div><div class="mk-sub">${esc(x.symbol)}</div></div></div>
        <div class="mk-card-row"><span>${price(x.price, x.currency)}</span><span class="${signCls(x.dayPct)}">${pct(x.dayPct, { sign: true })}</span></div>
        ${rangeBar(x.price, x.low, x.high)}
        <div class="mk-sub">מהשיא ${pct(x.fromHigh)} · P/E ${plain(x.pe)} · שווי שוק ${bigNum(x.cap)}</div>
        ${x.why ? `<div class="mk-note">${esc(x.why)}</div>` : ""}
      </div>`)
      .join("")}</div>`
  );
}

// ---- רינדור ----

export function renderMarket() {
  const el = document.getElementById("marketBody");
  if (!el || !canSeeMarket()) return;
  const msg = (text, btn) => `<div class="log-empty" style="margin-bottom:10px">${text}</div>${btn || ""}`;
  let html;

  if (st.kind === "noSheet" || (!st.data && !getMarketSheetId())) {
    html = msg("בוחרים את גיליון מעקב המניות פעם אחת בהגדרות ›", `<button class="btn-primary" id="mkGoSettings">למסך ההגדרות</button>`);
  } else if (st.kind === "needToken") {
    html = msg("צריך להתחבר ל-Google Drive כדי לקרוא את הגיליון.", `<button class="btn-primary" id="mkConnect">התחברות ל-Google Drive</button>`);
  } else if (st.kind === "apiDisabled") {
    html = msg("צריך להפעיל את Google Sheets API בפרויקט הענן.", `<button class="icon-edit-btn" id="mkRetry">↻ נסה שוב</button>`);
  } else if (st.kind === "sheetUnreadable") {
    html = msg("לא הצלחתי לקרוא את הגיליון. בחרו אותו מחדש בהגדרות.", `<button class="btn-primary" id="mkGoSettings">למסך ההגדרות</button>`);
  } else if (st.kind === "network" && !st.data) {
    html = msg("לא הצלחתי לרענן.", `<button class="icon-edit-btn" id="mkRetry">↻ נסה שוב</button>`);
  } else if (!st.data) {
    html = msg(st.loading ? "טוען…" : "לחצו על רענון כדי לטעון את הנתונים.", st.loading ? "" : `<button class="icon-edit-btn" id="mkRetry">↻ רענון</button>`);
  } else {
    const d = st.data;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(getMarketSheetId() || "")}/edit`;
    const investValue = d.summary && d.summary.value != null ? d.summary.value : d.holdings ? d.holdings.investments.reduce((a, i) => a + (num(i.value) || 0), 0) : null;
    html = `
      <div class="mk-statusbar">
        <span class="mk-sub">${d.summary && d.summary.updated ? `חישוב אחרון בגיליון: ${d.summary.updated.text}` : "חישוב אחרון בגיליון: —"}${st.loading ? " · מרענן…" : ""}</span>
        <span class="mk-actions"><button class="icon-edit-btn" id="mkRetry">↻ רענון</button>
        <a class="icon-edit-btn" href="${sheetUrl}" target="_blank" rel="noopener noreferrer">עריכה בגיליון</a></span>
      </div>
      ${st.refreshFailed ? `<div class="field-error" style="margin-bottom:10px">לא הצלחתי לרענן — מוצגים הנתונים האחרונים שנטענו.</div>` : ""}
      ${d.summary ? metrics(d.summary) : section("סיכום", STRUCT)}
      ${targetsSection(d.targets, investValue)}
      ${holdingsSection(d.holdings)}
      ${liquidSection(d.holdings)}
      ${watchSection(d.watch)}
      <p class="footer-note">קריאה בלבד — הנתונים נקראים ישירות מהגיליון ולא נשמרים באפליקציה.</p>`;
  }

  el.innerHTML = html;
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener("click", fn); };
  on("mkRetry", refreshMarket);
  on("mkConnect", refreshMarket);
  on("mkGoSettings", () => showScreen("settings"));
  el.querySelectorAll("[data-mk-targets]").forEach((b) =>
    b.addEventListener("click", () => { targetsView = b.dataset.mkTargets; renderMarket(); })
  );
}

