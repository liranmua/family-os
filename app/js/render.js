// Family OS — פונקציות render. קוראות מ-state, לא משנות אותו.
// מבוסס family_hub_dashboard.html.

import { state } from "./state.js";
import {
  CATEGORY_COLOR, PEOPLE, STATUS_LABEL, STATUS_CLASS, TYPE_META,
  formatDateDisplay, todayStr, esc,
} from "./constants.js";
import { openItemForm, openTaskDetail, openUpdateForm, openFinanceForm } from "./forms.js";
import { showScreen } from "./nav.js";

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

function getUpdates(entityType, entityId) {
  return state.updatesLog.filter((u) => u.entityType === entityType && u.entityId === entityId);
}

export function todaysCompletion(routineId) {
  const today = todayStr();
  return state.routineCompletions.find((c) => c.routineId === routineId && c.date === today);
}

// ---- KPIs ----

// ---- Hub (מסך ראשי): רצועת "היום" + רשת אזורים ----

export function renderHub() {
  const glanceEl = document.getElementById("todayGlance");
  const tilesEl = document.getElementById("hubTiles");
  if (!glanceEl || !tilesEl) return;

  const today = todayStr();
  const openTasks = state.tasks.filter((t) => t.status !== "done");
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const activeProjects = state.projects.filter((p) => p.status !== "done");
  const shortShopping = state.shopping.filter((s) => s.status !== "במלאי");
  const activeRoutines = state.routines.filter((r) => r.active);
  const routinesDoneToday = activeRoutines.filter((r) => {
    const c = todaysCompletion(r.id);
    return c && c.done;
  }).length;
  const f = state.finance || {};
  const budgetLbl = f.budgetFree != null ? `₪${Number(f.budgetFree).toLocaleString("he-IL")}` : "—";
  const goalLbl = f.savingsGoalPct != null ? `${f.savingsGoalPct}%` : "—";

  glanceEl.innerHTML = `
    <div class="glance-title">היום</div>
    <button class="glance-row" data-go="tasks">
      <span class="gi">✅</span><span>${openTasks.length} משימות פתוחות</span>
      ${overdue.length ? `<span class="pill pill-bad">${overdue.length} באיחור</span>` : ""}
    </button>
    <button class="glance-row" data-go="routines">
      <span class="gi">🔁</span><span>שגרות היום</span>
      <span class="pill ${activeRoutines.length && routinesDoneToday === activeRoutines.length ? "pill-ok" : "pill-warn"}">${routinesDoneToday}/${activeRoutines.length}</span>
    </button>
    <button class="glance-row" data-go="calendar">
      <span class="gi">📅</span><span>יומן</span>
      <span class="pill pill-mut">בקרוב</span>
    </button>
    <button class="glance-row" data-go="shopping">
      <span class="gi">🛒</span><span>רשימת קניות</span>
      <span class="pill pill-mut">${shortShopping.length} חסרים</span>
    </button>`;

  const tiles = [
    { key: "tasks", cls: "tc-tasks", icon: "✅", name: "משימות", sub: `${openTasks.length} פתוחות${overdue.length ? ` · ${overdue.length} באיחור` : ""}` },
    { key: "shopping", cls: "tc-shop", icon: "🛒", name: "קניות", sub: `${shortShopping.length} חסרים` },
    { key: "calendar", cls: "tc-cal", icon: "📅", name: "יומן", sub: "בקרוב" },
    { key: "finance", cls: "tc-fin", icon: "💰", name: "פיננסים", sub: `פנוי ${budgetLbl} · יעד ${goalLbl}` },
    { key: "projects", cls: "tc-proj", icon: "🧩", name: "פרויקטים", sub: `${activeProjects.length} פעילים` },
    { key: "routines", cls: "tc-routine", icon: "🔁", name: "שגרות", sub: `${activeRoutines.length} פעילות · ${routinesDoneToday}/${activeRoutines.length} היום` },
  ];
  tilesEl.innerHTML = tiles
    .map((t) => `
      <button class="tile ${t.cls}" data-go="${t.key}">
        <div class="tile-name">${t.icon} ${esc(t.name)}</div>
        <div class="tile-sub">${esc(t.sub)}</div>
      </button>`)
    .join("");

  [...glanceEl.querySelectorAll("[data-go]"), ...tilesEl.querySelectorAll("[data-go]")].forEach((el) =>
    el.addEventListener("click", () => showScreen(el.dataset.go))
  );
}

// ---- Projects ----

export function renderProjects() {
  const list = byCat(state.projects);
  const el = document.getElementById("projectsCards");
  el.innerHTML =
    list
      .map((p) => {
        const prog = projectProgress(p);
        const log = getUpdates("project", p.id);
        return `
      <div class="card" style="border-color:${CATEGORY_COLOR[p.category] || "var(--neutral)"}">
        <div class="top-row">
          <h3>${esc(p.name)}</h3>
          <div style="display:flex;gap:6px;align-items:flex-start">
            <span class="badge status-pill ${STATUS_CLASS[p.status]}">${STATUS_LABEL[p.status]}</span>
            <button class="icon-edit-btn" data-edit-project="${esc(p.id)}" aria-label="עריכה">✏️</button>
          </div>
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
          <span class="hist-lbl" style="font-size:11px;color:var(--text-secondary)">לוג עדכונים${log.length ? ` (${log.length})` : ""}</span>
          <button class="icon-edit-btn" data-add-update="${esc(p.id)}">+ עדכון</button>
        </div>
        ${
          log.length
            ? `<div class="log-list" style="margin-top:6px">${log
                .map((l) => `<div class="log-entry">${esc(l.note)}<span class="log-meta">${esc(l.author)} · ${formatDateDisplay(l.date) || esc(l.date)}</span></div>`)
                .join("")}</div>`
            : `<div class="log-empty">אין עוד עדכונים לפרויקט הזה</div>`
        }
      </div>`;
      })
      .join("") + `<div class="card add-row" id="addProjectCard">+ פרויקט חדש</div>`;

  el.querySelectorAll("[data-edit-project]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); openItemForm("project", btn.dataset.editProject); })
  );
  el.querySelectorAll("[data-add-update]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); openUpdateForm("project", btn.dataset.addUpdate); })
  );
  const addCard = document.getElementById("addProjectCard");
  if (addCard) addCard.addEventListener("click", () => openItemForm("project"));
}

// ---- Tasks ----

export function renderTasks() {
  const list = byCat(state.tasks);
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
    : `<tr class="empty-row"><td colspan="8">אין משימות${activeCategoryFilter ? " בתחום הזה" : ""} — הוסיפו אחת עם הכפתור למעלה</td></tr>`;

  document.getElementById("tasksTable").innerHTML = `
    <thead><tr><th>משימה</th><th>תחום</th><th>אחראי</th><th>תאריך</th><th>סטטוס</th><th>התקדמות</th><th>נוגע ל</th><th></th></tr></thead>
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

// ---- Shopping ----

export function renderShopping() {
  const list = state.shopping;
  const rows = list.length
    ? list
        .map(
          (s) => `
        <tr class="row-click" data-shop-id="${esc(s.id)}" tabindex="0">
          <td>${esc(s.name)}</td>
          <td>${esc(s.category || "—")}</td>
          <td>${esc(s.qty || "—")}</td>
          <td><span class="shop-pill shop-${esc(s.status)}">${esc(s.status)}</span></td>
          <td>${esc(s.store || "—")}</td>
          <td class="chevron">›</td>
        </tr>`
        )
        .join("")
    : `<tr class="empty-row"><td colspan="6">רשימת הקניות ריקה — הוסיפו פריט עם הכפתור למעלה</td></tr>`;

  document.getElementById("shopTable").innerHTML = `
    <thead><tr><th>פריט</th><th>קטגוריה</th><th>כמות</th><th>סטטוס</th><th>חנות</th><th></th></tr></thead>
    <tbody>${rows}</tbody>`;

  document.querySelectorAll("#shopTable tr.row-click").forEach((row) => {
    const open = () => openItemForm("shopping", row.dataset.shopId);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
  });
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
}
