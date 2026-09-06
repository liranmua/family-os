// Family OS — פונקציות render. קוראות מ-state, לא משנות אותו.
// מבוסס family_hub_dashboard.html.

import { state } from "./state.js";
import {
  CATEGORY_COLOR, PEOPLE, STATUS_LABEL, STATUS_CLASS, TYPE_META,
  formatDateDisplay, todayStr, esc,
} from "./constants.js";
import { openItemForm, openTaskDetail } from "./forms.js";

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

function kpis() {
  const openTasks = state.tasks.filter((t) => t.status !== "done").length;
  const activeProjects = state.projects.filter((p) => p.status !== "done").length;
  const shortShopping = state.shopping.filter((s) => s.status !== "במלאי").length;
  const activeRoutines = state.routines.filter((r) => r.active);
  const routinesDoneToday = activeRoutines.filter((r) => {
    const c = todaysCompletion(r.id);
    return c && c.done;
  }).length;
  return [
    { num: openTasks, lbl: "משימות פתוחות" },
    { num: activeProjects, lbl: "פרויקטים פעילים" },
    { num: `${routinesDoneToday}/${activeRoutines.length}`, lbl: "שגרות שבוצעו היום" },
    { num: shortShopping, lbl: "פריטי קניות חסרים" },
  ];
}

export function renderKpis() {
  document.getElementById("kpiRow").innerHTML = kpis()
    .map((k) => `<div class="kpi"><div class="num">${esc(k.num)}</div><div class="lbl">${esc(k.lbl)}</div></div>`)
    .join("");
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
        ${
          log.length
            ? `<div class="log-list">${log
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
  renderKpis();
  renderProjects();
  renderTasks();
  renderRoutines(_onRoutineToggle);
  renderShopping();
  renderPeople();
}
