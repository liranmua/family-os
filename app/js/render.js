// Family OS — פונקציות render. קוראות מ-state, לא משנות אותו.
// מבוסס family_hub_dashboard.html.

import { state } from "./state.js";
import {
  CATEGORY_COLOR, PEOPLE, ASSIGNABLE_NAMES, EMAIL_TO_NAME, STATUS_LABEL, STATUS_CLASS, TYPE_META, SHOP_STORE_TYPES, DAY_NAMES,
  formatDateDisplay, todayStr, esc,
} from "./constants.js";
import {
  openItemForm, openTaskDetail, openUpdateForm, openFinanceForm,
  openProjectDetail, refreshProjectDetailIfOpen, openCalendarSettingsForm,
} from "./forms.js";
import { showScreen } from "./nav.js";
import { currentUser } from "./auth.js";
import {
  isConnected as calIsConnected, getEvents as calGetEvents, getLastFetchedAt as calGetLastFetchedAt,
  getLastError as calGetLastError, connectCalendar, fetchEvents as calFetchEvents, disconnectCalendar,
} from "./calendar.js";

let activeCategoryFilter = "";
export function setCategoryFilter(v) { activeCategoryFilter = v; }
export function getCategoryFilter() { return activeCategoryFilter; }

function byCat(list) {
  return activeCategoryFilter ? list.filter((x) => x.category === activeCategoryFilter) : list;
}

// ---- חישובים ----

export function projectProgress(p) {
  const linked = state.tasks.filter((t) => t.projectId === p.id);
  const done = linked.filter((t) => t.status === "done").length;
  const pct = linked.length ? Math.round((100 * done) / linked.length) : 0;
  return { total: linked.length, done, pct };
}

export function subtaskProgress(t) {
  const subs = t.subtasks || [];
  return { total: subs.length, done: subs.filter((s) => s.done).length };
}

export function todaysCompletion(routineId) {
  const today = todayStr();
  return state.routineCompletions.find((c) => c.routineId === routineId && c.date === today);
}

// ---- KPIs ----

// ---- Home (מסך ראשי): תמונת-יום מאוחדת אחת, כרונולוגית ----
// ממזגת 3 מקורות: אירועי Google Calendar אמיתיים (של היום) + בלוקים מהלוח השבועי הפנימי
// (חלים על היום, לפי dayOfWeek) + משימות דחופות (אותה לוגיקה בדיוק כמו renderTasksDashboard).
// הרחבה של אותו רעיון מיזוג כמו renderCalendarAgenda — רק חלון "היום" בלבד, ומקור שלישי (משימות).
// לחיצה על פריט מנווטת למסך האזור הרלוונטי, לא פותחת עריכה/מודאל מהבית.

// המשתמש המחובר -> שם מוכר ("לירן"/"מורן"), לצורך סדר עדיפות אישי. null אם לא ידוע/לא מחובר.
function currentPersonName() {
  const u = currentUser();
  if (!u || !u.email) return null;
  return EMAIL_TO_NAME[u.email] || null;
}
function otherPersonName(me) {
  return ASSIGNABLE_NAMES.find((n) => n !== me) || null;
}

function homeGroupHtml(title, items) {
  if (!items.length) return "";
  const sorted = [...items].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return `
    <div class="urgent-group">
      <div class="ug-head">${esc(title)}</div>
      ${sorted
        .map(
          (it) => `
        <button class="urgent-item" data-go="${it.go}">
          <span class="ui-name">${esc(it.title)}${it.tag ? `<span class="block-badge">${esc(it.tag)}</span>` : ""}</span>
          <span class="ui-meta">${esc(it.time)}</span>
        </button>`
        )
        .join("")}
    </div>`;
}

export function renderHub() {
  const el = document.getElementById("homeAgenda");
  if (!el) return;

  const today = todayStr();
  const dow = new Date().getDay();
  const me = currentPersonName();

  // מקור 1: אירועי יומן אמיתיים של היום — מוצג רק היומן של הצופה עצמו, אז תמיד "שלו".
  const events = calIsConnected()
    ? calGetEvents()
        .filter((ev) => (ev.start || "").slice(0, 10) === today)
        .map((ev) => ({ sortKey: fmtEventTime(ev) === "כל היום" ? "00:00" : (ev.start || "").slice(11, 16) || "00:00", time: fmtEventTime(ev), title: ev.title, go: "calendar", owner: me }))
    : [];

  // מקור 2: בלוקים מהלוח השבועי הפנימי שחלים היום (לעולם לא נכתבים ל-Google — ראו renderCalendarAgenda).
  const blocks = state.weeklyBlocks
    .filter((b) => b.dayOfWeek === dow)
    .map((b) => ({
      sortKey: b.startTime || "00:00",
      time: [b.startTime, b.endTime].filter(Boolean).join("–") || "כל היום",
      title: b.title, go: "calendar", owner: b.leader, tag: "🏠 פנימי",
    }));

  // מקור 3: משימות דחופות — אותה לוגיקה בדיוק כמו renderTasksDashboard (לא הגדרה חדשה).
  const openTasks = state.tasks.filter((t) => t.status !== "done");
  const tasks = openTasks
    .filter((t) => (t.dueDate && t.dueDate <= today) || t.priority === "דחוף")
    .map((t) => ({
      sortKey: t.dueTime || "00:00",
      time: t.dueTime || (t.dueDate && t.dueDate < today ? "באיחור" : "ללא שעה"),
      title: t.name, go: "tasks", owner: t.owner, tag: "✅ משימה",
    }));

  const all = [...events, ...blocks, ...tasks];
  let html;
  if (me) {
    const otherName = otherPersonName(me);
    const mine = all.filter((it) => it.owner === me || it.go === "calendar");
    const theirs = otherName ? all.filter((it) => it.owner === otherName) : [];
    html = homeGroupHtml("שלך היום", mine) + (theirs.length ? homeGroupHtml(`גם היום אצל ${otherName}`, theirs) : "");
  } else {
    html = homeGroupHtml("היום", all);
  }

  el.innerHTML = html || `<div class="log-empty">אין כלום מיוחד היום 🎉</div>`;
  el.querySelectorAll("[data-go]").forEach((btn) => btn.addEventListener("click", () => showScreen(btn.dataset.go)));
}

// ---- Projects ----

export function renderProjects() {
  const list = byCat(state.projects);
  const el = document.getElementById("projectsCards");
  el.innerHTML =
    list
      .map((p) => {
        const prog = projectProgress(p);
        return `
      <div class="card row-click" data-open-project="${esc(p.id)}" style="border-color:${CATEGORY_COLOR[p.category] || "var(--neutral)"}">
        <div class="top-row">
          <h3>${esc(p.name)}</h3>
          <span class="badge status-pill ${STATUS_CLASS[p.status]}">${STATUS_LABEL[p.status]}</span>
        </div>
        <div class="meta">
          <span>👤 ${esc(p.owner)}</span>
          <span>📁 ${esc(p.category)}</span>
          <span>🎯 עדיפות: ${esc(p.priority)}</span>
          ${p.target ? `<span>📅 יעד: ${formatDateDisplay(p.target)}</span>` : ""}
          ${p.budget != null && p.budget !== "" ? `<span>💰 תקציב: ${esc(p.budget)}</span>` : ""}
        </div>
        <div class="progress-row">
          <div class="progress-track"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
          <span class="progress-label">${prog.done}/${prog.total} משימות הושלמו · ${prog.pct}%</span>
        </div>
        <div class="card-chevron">פתיחת פרויקט ›</div>
      </div>`;
      })
      .join("") + `<div class="card add-row" id="addProjectCard">+ פרויקט חדש</div>`;

  el.querySelectorAll("[data-open-project]").forEach((card) =>
    card.addEventListener("click", () => openProjectDetail(card.dataset.openProject))
  );
  const addCard = document.getElementById("addProjectCard");
  if (addCard) addCard.addEventListener("click", () => openItemForm("project"));
}

// ---- Tasks ----

let taskSearchQuery = "";
export function setTaskSearchQuery(q) { taskSearchQuery = q; }
export function getTaskSearchQuery() { return taskSearchQuery; }

function filteredTasksList() {
  let list = byCat(state.tasks);
  const q = taskSearchQuery.trim().toLowerCase();
  if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
  return list;
}

function renderTasksDashboard() {
  const dash = document.getElementById("tasksDashboard");
  if (!dash) return;
  const today = todayStr();
  const open = state.tasks.filter((t) => t.status !== "done");
  const urgent = open.filter((t) => (t.dueDate && t.dueDate <= today) || t.priority === "דחוף");
  const byCategory = {};
  urgent.forEach((t) => { (byCategory[t.category] ||= []).push(t); });
  const cats = Object.keys(byCategory);

  dash.innerHTML = `
    <div class="tasks-counter">
      <span class="tc-num">${open.length}</span>
      <span class="tc-lbl">משימות פתוחות</span>
      ${urgent.length ? `<span class="pill pill-bad">${urgent.length} דחופות</span>` : ""}
    </div>
    ${
      cats.length
        ? `<div class="urgent-groups">${cats
            .map(
              (cat) => `
        <div class="urgent-group">
          <div class="ug-head" style="border-color:${CATEGORY_COLOR[cat] || "var(--neutral)"}">${esc(cat)}</div>
          ${byCategory[cat]
            .map(
              (t) => `
            <button class="urgent-item" data-open-task="${esc(t.id)}">
              <span class="ui-name">${esc(t.name)}</span>
              <span class="ui-meta">${esc(t.owner)}${t.dueDate ? " · " + formatDateDisplay(t.dueDate) : ""}</span>
            </button>`
            )
            .join("")}
        </div>`
            )
            .join("")}</div>`
        : `<div class="log-empty">אין משימות דחופות כרגע 🎉</div>`
    }`;

  dash.querySelectorAll("[data-open-task]").forEach((btn) =>
    btn.addEventListener("click", () => openTaskDetail(btn.dataset.openTask))
  );
}

export function renderTasks() {
  renderTasksDashboard();
  const list = filteredTasksList();
  const rows = list.length
    ? list
        .map((t) => {
          const sp = subtaskProgress(t);
          const pct = sp.total ? Math.round((100 * sp.done) / sp.total) : 0;
          const progressCell = sp.total
            ? `<div class="progress-cell"><div class="progress-track-sm"><div class="progress-fill-sm" style="width:${pct}%"></div></div><span class="progress-text">${sp.done}/${sp.total}</span></div>`
            : `<span class="progress-text">—</span>`;
          const relatedCell = t.relatedPerson ? `<span class="related-badge">👶 ${esc(t.relatedPerson)}</span>` : "";
          const type = TYPE_META[t.taskType] || TYPE_META["חד-פעמית"];
          const dateCell = [formatDateDisplay(t.dueDate), t.dueTime].filter(Boolean).join(" · ") || "—";
          return `
        <tr class="row-click" data-task-id="${esc(t.id)}" tabindex="0">
          <td><span class="type-icon ${type.cls}" title="${esc(t.taskType)}">${type.icon}</span>${esc(t.name)}</td>
          <td>${esc(t.category)}</td>
          <td>${esc(t.owner)}</td>
          <td style="color:var(--text-secondary)">${dateCell}</td>
          <td><span class="badge status-pill ${STATUS_CLASS[t.status]}">${STATUS_LABEL[t.status]}</span></td>
          <td>${progressCell}</td>
          <td>${relatedCell}</td>
          <td class="chevron">›</td>
        </tr>`;
        })
        .join("")
    : `<tr class="empty-row"><td colspan="8">${taskSearchQuery.trim() ? "לא נמצאו משימות תואמות לחיפוש" : `אין משימות${activeCategoryFilter ? " בתחום הזה" : ""} — הוסיפו אחת עם הכפתור למעלה`}</td></tr>`;

  document.getElementById("tasksTable").innerHTML = `
    <thead><tr><th>משימה</th><th>תחום</th><th>מוביל</th><th>תאריך</th><th>סטטוס</th><th>התקדמות</th><th>נוגע ל</th><th></th></tr></thead>
    <tbody>${rows}</tbody>`;

  document.querySelectorAll("#tasksTable tr.row-click").forEach((row) => {
    row.addEventListener("click", () => openTaskDetail(row.dataset.taskId));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter") openTaskDetail(row.dataset.taskId); });
  });
}

// ---- Routines ----

export function renderRoutines(onToggle) {
  const list = byCat(state.routines);
  const today = todayStr();
  const histDates = [-2, -1, 0].map((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return todayStr(d);
  });
  const dateLabel = (d) => (d === today ? "היום" : formatDateDisplay(d));

  document.getElementById("routinesGrid").innerHTML = list.length
    ? list
        .map((r) => {
          const c = todaysCompletion(r.id);
          const isDone = !!(c && c.done);
          const historyDots = histDates
            .map((d) => {
              const rec = state.routineCompletions.find((x) => x.routineId === r.id && x.date === d);
              const cls = rec ? (rec.done ? "done" : "missed") : "";
              return `<span class="hist-dot ${cls}" title="${dateLabel(d)}${rec ? (rec.done ? " · בוצע" : " · לא בוצע") : " · אין נתון"}"></span>`;
            })
            .join("");
          return `
        <div class="routine-card" style="border-color:${CATEGORY_COLOR[r.category] || "var(--neutral)"}">
          <div class="routine-top">
            <div>
              <h3>${esc(r.name)}${r.active ? "" : ' <span class="progress-text">(לא פעילה)</span>'}</h3>
              <div class="meta" style="margin-top:4px"><span>👤 ${esc(r.assignee)}</span><span>📁 ${esc(r.category)}</span></div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="icon-edit-btn" data-edit-routine="${esc(r.id)}" aria-label="עריכה">✏️</button>
              <button class="routine-toggle ${isDone ? "done" : "pending"}" data-routine-id="${esc(r.id)}">
                ${isDone ? "✓ בוצע היום" : "סמן כבוצע"}
              </button>
            </div>
          </div>
          ${r.notes ? `<div class="log-empty" style="font-style:normal">${esc(r.notes)}</div>` : ""}
          <div class="routine-history"><span class="hist-lbl">3 ימים אחרונים:</span>${historyDots}</div>
        </div>`;
        })
        .join("")
    : `<div class="log-empty">אין שגרות${activeCategoryFilter ? " בתחום הזה" : ""} — הוסיפו אחת עם הכפתור למעלה</div>`;

  document.querySelectorAll(".routine-toggle").forEach((btn) =>
    btn.addEventListener("click", () => onToggle(btn.dataset.routineId))
  );
  document.querySelectorAll("[data-edit-routine]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); openItemForm("routine", btn.dataset.editRoutine); })
  );
}

// ---- Shopping: שלוש רשימות נפרדות לפי סוג חנות ----

let activeStoreType = SHOP_STORE_TYPES[0];
export function setActiveStoreType(v) { activeStoreType = v; }
export function getActiveStoreType() { return activeStoreType; }

function itemStoreType(s) { return s.storeType || SHOP_STORE_TYPES[0]; }

function renderStoreTabs() {
  const tabsEl = document.getElementById("storeTabs");
  if (!tabsEl) return;
  tabsEl.innerHTML = SHOP_STORE_TYPES.map((st) => {
    const count = state.shopping.filter((s) => itemStoreType(s) === st && s.status !== "במלאי").length;
    return `
      <button class="store-tab ${st === activeStoreType ? "active" : ""}" data-store-tab="${esc(st)}">
        ${esc(st)}${count ? `<span class="store-tab-count">${count}</span>` : ""}
      </button>`;
  }).join("");
  tabsEl.querySelectorAll("[data-store-tab]").forEach((btn) =>
    btn.addEventListener("click", () => { setActiveStoreType(btn.dataset.storeTab); renderShopping(); })
  );
}

// מחיר ליחידה × כמות. כמות היא טקסט חופשי ("2", "1 ק״ג", "קרטון") — מוציאים
// ממנה מספר מוביל אם יש, אחרת מניחים יחידה אחת.
function lineTotal(s) {
  if (s.price == null) return null;
  const qtyNum = parseFloat(s.qty);
  const mult = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;
  return s.price * mult;
}
function fmtMoney(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `₪${r}` : `₪${r.toFixed(2)}`;
}

function renderShopSubtotal(list) {
  const el = document.getElementById("shopSubtotal");
  if (!el) return;
  const relevant = list.filter((s) => s.status !== "במלאי");
  if (!relevant.length) { el.innerHTML = ""; return; }
  const withPrice = relevant.filter((s) => s.price != null);
  const total = withPrice.reduce((sum, s) => sum + (lineTotal(s) || 0), 0);
  el.innerHTML = `
    <span class="shop-subtotal-label">סך הכל לרשימה (לא כולל "במלאי")</span>
    <span class="shop-subtotal-value">${fmtMoney(total)}</span>
    ${withPrice.length < relevant.length ? `<span class="shop-subtotal-note">(${relevant.length - withPrice.length} בלי מחיר)</span>` : ""}`;
}

export function renderShopping() {
  renderStoreTabs();
  const list = state.shopping.filter((s) => itemStoreType(s) === activeStoreType);
  renderShopSubtotal(list);
  const rows = list.length
    ? list
        .map((s) => {
          const lt = lineTotal(s);
          return `
        <tr class="row-click" data-shop-id="${esc(s.id)}" tabindex="0">
          <td>${esc(s.name)}</td>
          <td>${esc(s.category || "—")}</td>
          <td>${esc(s.qty || "—")}</td>
          <td>${s.price != null ? fmtMoney(s.price) : "—"}</td>
          <td>${lt != null ? fmtMoney(lt) : "—"}</td>
          <td>${esc(s.notes || "—")}</td>
          <td><span class="shop-pill shop-${esc(s.status)}">${esc(s.status)}</span></td>
          <td class="chevron">›</td>
        </tr>`;
        })
        .join("")
    : `<tr class="empty-row"><td colspan="8">הרשימה "${esc(activeStoreType)}" ריקה — הוסיפו פריט עם הכפתור למעלה</td></tr>`;

  document.getElementById("shopTable").innerHTML = `
    <thead><tr><th>פריט</th><th>קטגוריה</th><th>כמות</th><th>מחיר</th><th>סה״כ</th><th>הערות</th><th>סטטוס</th><th></th></tr></thead>
    <tbody>${rows}</tbody>`;

  document.querySelectorAll("#shopTable tr.row-click").forEach((row) => {
    const open = () => openItemForm("shopping", row.dataset.shopId);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
  });
}

// ---- יומן (קריאה בלבד) ----

function fmtEventTime(ev) {
  if (ev.allDay) return "כל היום";
  const d = new Date(ev.start);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
function fmtDayLabel(dayIso) {
  const today = todayStr();
  if (dayIso === today) return "היום";
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  if (dayIso === todayStr(tmr)) return "מחר";
  const d = new Date(dayIso + "T00:00:00");
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });
}

// שבעת התאריכים הקרובים (כולל היום), כל אחד עם ה-dayOfWeek שלו (כמו Date.getDay()) —
// כדי לדעת אילו בלוקים מהלוח השבועי הקבוע חלים על כל תאריך בפועל.
function weekDates() {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    out.push({ iso: todayStr(d), dow: d.getDay() });
  }
  return out;
}

// תצוגת "השבוע" — מיזוג אירועי היומן האמיתיים עם בלוקי הלוח השבועי הפנימי, מקובץ
// לפי יום. בלוק פנימי מסומן בבירור (class + תג "פנימי") כדי שלא ייראה כמו אירוע Google.
function renderCalendarAgenda(container) {
  const groups = {};
  calGetEvents().forEach((ev) => {
    const day = (ev.start || "").slice(0, 10);
    if (!day) return;
    (groups[day] ||= []).push(ev);
  });

  const dayBlocks = weekDates()
    .map(({ iso, dow }) => {
      const realItems = (groups[iso] || []).map((ev) => ({
        time: fmtEventTime(ev), sortKey: (ev.start || "").slice(11, 16) || "00:00",
        title: ev.title, isBlock: false,
      }));
      const blockItems = state.weeklyBlocks
        .filter((b) => b.dayOfWeek === dow)
        .map((b) => ({
          time: [b.startTime, b.endTime].filter(Boolean).join("–") || "כל היום",
          sortKey: b.startTime || "00:00",
          title: b.title, leader: b.leader, isBlock: true,
        }));
      const items = [...realItems, ...blockItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      return { iso, items };
    })
    .filter((d) => d.items.length);

  container.innerHTML = dayBlocks.length
    ? dayBlocks
        .map(
          ({ iso, items }) => `
      <div class="urgent-group">
        <div class="ug-head" style="border-color:var(--accent-cal)">${esc(fmtDayLabel(iso))}</div>
        ${items
          .map(
            (it) => `
          <div class="urgent-item ${it.isBlock ? "block-item" : ""}" style="cursor:default">
            <span class="ui-name">${esc(it.title)}${it.isBlock ? `<span class="block-badge">🏠 פנימי · ${esc(it.leader)}</span>` : ""}</span>
            <span class="ui-meta">${esc(it.time)}</span>
          </div>`
          )
          .join("")}
      </div>`
        )
        .join("")
    : `<div class="log-empty">אין אירועים או בלוקים בשבוע הקרוב</div>`;
}

// תצוגת ניהול — CRUD על בלוקי הלוח השבועי הפנימי (weeklyBlocks). לעולם לא נכתב ל-Google.
function renderCalendarManage(container) {
  const list = [...state.weeklyBlocks].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || String(a.startTime || "").localeCompare(String(b.startTime || ""))
  );
  const rows = list.length
    ? list
        .map(
          (b) => `
        <tr class="row-click" data-block-id="${esc(b.id)}" tabindex="0">
          <td>${esc(DAY_NAMES[b.dayOfWeek] ?? "—")}</td>
          <td>${esc([b.startTime, b.endTime].filter(Boolean).join("–") || "—")}</td>
          <td>${esc(b.title)}</td>
          <td>${esc(b.leader)}</td>
          <td>${esc(b.category || "—")}</td>
          <td class="chevron">›</td>
        </tr>`
        )
        .join("")
    : `<tr class="empty-row"><td colspan="6">אין עדיין בלוקים בלוח השבועי — הוסיפו אחד עם הכפתור למעלה</td></tr>`;

  container.innerHTML = `
    <div class="toolbar-row"><button class="btn-primary" id="addWeeklyBlockBtn">+ בלוק שבועי</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>יום</th><th>שעות</th><th>כותרת</th><th>מוביל</th><th>תחום</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="footer-note" style="margin-top:14px">בלוקים אלה פנימיים לאפליקציה בלבד — לעולם לא נכתבים ל-Google Calendar.</p>`;

  document.getElementById("addWeeklyBlockBtn").addEventListener("click", () => openItemForm("weeklyBlock"));
  container.querySelectorAll("tr.row-click").forEach((row) => {
    const open = () => openItemForm("weeklyBlock", row.dataset.blockId);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
  });
}

let calendarSubView = "agenda"; // "agenda" | "manage"

export function renderCalendarScreen() {
  const body = document.getElementById("calendarBody");
  if (!body) return;
  const err = calGetLastError();

  if (!calIsConnected()) {
    body.innerHTML = `
      <div class="log-empty" style="margin-bottom:12px">
        עדיין לא מחובר. לאחר החיבור תוצג כאן תצוגת <b>קריאה בלבד</b> של היומן שלך —
        האפליקציה לא יוצרת, לא עורכת ולא מוחקת שום דבר ביומן. כרגע רק היומן של לירן;
        מורן תתחבר בנפרד בהמשך.
      </div>
      ${err ? `<div class="field-error" style="margin-bottom:10px">${esc(err)}</div>` : ""}
      <button class="btn-primary" id="calConnectBtn">חבר את יומן Google</button>`;
    document.getElementById("calConnectBtn").addEventListener("click", connectCalendar);
    return;
  }

  const last = calGetLastFetchedAt();
  body.innerHTML = `
    <div class="toolbar-row" style="justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:var(--text-secondary)">
        ${last ? `עודכן ${last.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : "טרם נטען"}
      </span>
      <div style="display:flex;gap:6px">
        <button class="icon-edit-btn" id="calSettingsBtn">📋 יומנים</button>
        <button class="icon-edit-btn" id="calRefreshBtn">🔄 רענון</button>
        <button class="icon-edit-btn" id="calDisconnectBtn">התנתקות</button>
      </div>
    </div>
    ${err ? `<div class="field-error" style="margin-bottom:10px">${esc(err)}</div>` : ""}
    <div class="store-tabs">
      <button class="store-tab ${calendarSubView === "agenda" ? "active" : ""}" data-cal-tab="agenda">📅 השבוע</button>
      <button class="store-tab ${calendarSubView === "manage" ? "active" : ""}" data-cal-tab="manage">🗓️ ניהול הלוח</button>
    </div>
    <div id="calendarSubBody"></div>
    ${calendarSubView === "agenda" ? `<p class="footer-note" style="margin-top:14px">קריאה בלבד — לעריכה, פותחים את Google Calendar</p>` : ""}`;

  document.getElementById("calSettingsBtn").addEventListener("click", () => openCalendarSettingsForm());
  document.getElementById("calRefreshBtn").addEventListener("click", () => calFetchEvents());
  document.getElementById("calDisconnectBtn").addEventListener("click", () => disconnectCalendar());
  document.querySelectorAll("[data-cal-tab]").forEach((btn) =>
    btn.addEventListener("click", () => { calendarSubView = btn.dataset.calTab; renderCalendarScreen(); })
  );

  const sub = document.getElementById("calendarSubBody");
  if (calendarSubView === "manage") renderCalendarManage(sub);
  else renderCalendarAgenda(sub);
}

// ---- Finance (תצוגה מופשטת — לא טבלת נתונים גולמית) ----

export function renderFinance() {
  const el = document.getElementById("financeCard");
  if (!el) return;
  const f = state.finance || {};
  const decisions = Array.isArray(f.openDecisions) ? f.openDecisions.filter(Boolean) : [];
  const hasData = f.budgetFree != null || f.savingsGoalPct != null || decisions.length > 0;
  el.hidden = false;

  const budget = f.budgetFree != null ? `₪ ${Number(f.budgetFree).toLocaleString("he-IL")}` : "—";
  const goalPct = f.savingsGoalPct != null ? Math.max(0, Math.min(100, Number(f.savingsGoalPct))) : null;

  el.innerHTML = `
    <div class="fc-head">
      <h3>💰 תמונת פיננסים — מבט מהיר</h3>
      <button class="icon-edit-btn" id="editFinanceBtn">${hasData ? "✏️ עדכון" : "הגדרה"}</button>
    </div>
    ${
      hasData
        ? `<div class="finance-metrics">
            <div class="fc-metric"><div class="fc-k">תקציב פנוי החודש</div><div class="fc-v">${budget}</div></div>
            <div class="fc-metric">
              <div class="fc-k">התקדמות ליעד חיסכון</div>
              ${
                goalPct != null
                  ? `<div class="fc-v">${goalPct}%</div>
                     <div class="progress-track" style="margin-top:6px"><div class="progress-fill" style="width:${goalPct}%"></div></div>`
                  : `<div class="fc-v">—</div>`
              }
            </div>
            <div class="fc-metric"><div class="fc-k">החלטות שממתינות לשנינו</div><div class="fc-v">${decisions.length}</div></div>
          </div>
          ${
            decisions.length
              ? `<div class="fc-decisions"><div class="fc-k">החלטות פתוחות</div><ul>${decisions.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div>`
              : ""
          }`
        : `<div class="log-empty" style="margin:0">עדיין לא הוגדר. כאן יופיעו 2–3 מדדים בלבד — תקציב פנוי, יעד חיסכון, והחלטות שדורשות את שניכם — בלי טבלאות.</div>`
    }`;

  document.getElementById("editFinanceBtn").addEventListener("click", openFinanceForm);
}

// ---- People ----

export function renderPeople() {
  document.getElementById("peopleGrid").innerHTML = PEOPLE.map(
    (p) => `
    <div class="person-card" style="border-color:${p.assignable ? "var(--accent-parent)" : "var(--accent-child)"}">
      <div class="person-avatar" style="background:${p.assignable ? "var(--accent-parent)" : "var(--accent-child)"}">${p.assignable ? "👤" : "👶"}</div>
      <div>
        <div class="person-name">${esc(p.name)}</div>
        <div class="person-role">${esc(p.role)}${p.assignable ? " · יכול/ה להיות אחראי/ת על משימות" : ' · מוזכר/ת כ"נוגע ל" במשימות'}</div>
      </div>
    </div>`
  ).join("");
}

// ---- הכל ----

let _onRoutineToggle = () => {};
export function setRoutineToggleHandler(fn) { _onRoutineToggle = fn; }

export function renderAll() {
  renderHub();
  renderFinance();
  renderProjects();
  renderTasks();
  renderRoutines(_onRoutineToggle);
  renderShopping();
  renderPeople();
  renderCalendarScreen();
  refreshProjectDetailIfOpen();
}
