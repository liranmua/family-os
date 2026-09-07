// Family OS — מודאל פירוט משימה + טופסי הוספה/עריכה/מחיקה.
// מבוסס family_hub_dashboard.html. כל שמירה עוברת דרך state.js (write-through ל-IndexedDB).

import { state, upsert, remove, saveFinance } from "./state.js";
import {
  CATEGORY_LIST, ASSIGNABLE_NAMES, ALL_PEOPLE_NAMES, STATUS_LABEL, STATUS_ORDER,
  TYPE_META, PRIORITY_OPTIONS, FREQUENCY_OPTIONS, SHOP_STATUS_OPTIONS, SHOP_CATEGORY_OPTIONS,
  optionList, formatDateDisplay, nextId, todayStr, esc, escAttr,
} from "./constants.js";
import { renderAll, projectProgress, subtaskProgress } from "./render.js";

const overlay = () => document.getElementById("modalOverlay");
const modalEl = () => document.getElementById("modal");

export function closeModal() {
  overlay().hidden = true;
  modalEl().innerHTML = "";
}
function openModal(html) {
  modalEl().innerHTML = html;
  overlay().hidden = false;
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---- מודאל פירוט משימה ----

export function openTaskDetail(taskId) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const type = TYPE_META[t.taskType] || TYPE_META["חד-פעמית"];
  const project = t.projectId ? state.projects.find((p) => p.id === t.projectId) : null;
  const projProg = project ? projectProgress(project) : null;
  const log = state.updatesLog.filter((u) => u.entityType === "task" && u.entityId === t.id);
  const dateVal = [formatDateDisplay(t.dueDate), t.dueTime].filter(Boolean).join(" · ") || "—";
  const subs = t.subtasks || [];

  const metaItems = [
    ["תחום", t.category],
    ["אחראי", t.owner],
    ["סוג משימה", `${type.icon} ${t.taskType}`],
    ["סטטוס", STATUS_LABEL[t.status]],
    ["תאריך יעד", dateVal],
    ["תדירות", t.frequency],
    ["עדיפות", t.priority],
    ["נוגע ל", t.relatedPerson || "—"],
  ];

  openModal(`
    <div class="modal-header">
      <h2>${type.icon} ${esc(t.name)}</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="icon-edit-btn" id="modalEditBtn" aria-label="עריכה">✏️ עריכה</button>
        <button class="modal-close" id="modalCloseBtn" aria-label="סגירה">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="modal-meta-grid">
        ${metaItems.map(([k, v]) => `<div class="meta-item"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join("")}
      </div>
      ${
        t.next && t.next !== "—"
          ? `<div class="modal-section"><h4>השלב הבא</h4><p style="font-size:13.5px">${esc(t.next)}</p></div>`
          : ""
      }
      ${
        project
          ? `<div class="modal-section"><h4>פרויקט מקושר</h4>
              <div class="project-link-card">
                <span class="plc-name">🧩 ${esc(project.name)}</span>
                <div class="progress-row" style="margin-top:0">
                  <div class="progress-track"><div class="progress-fill" style="width:${projProg.pct}%"></div></div>
                  <span class="progress-label">${projProg.done}/${projProg.total} משימות הושלמו · ${projProg.pct}%</span>
                </div>
              </div></div>`
          : ""
      }
      <div class="modal-section">
        <h4>תתי-משימות ${subs.length ? `(${subtaskProgress(t).done}/${subtaskProgress(t).total})` : ""}</h4>
        ${
          subs.length
            ? `<div class="subtask-list" id="modalSubtaskList">${subs
                .map(
                  (s, i) => `
              <div class="subtask-item ${s.done ? "done" : ""}">
                <input type="checkbox" data-idx="${i}" ${s.done ? "checked" : ""} id="stx-${i}">
                <label for="stx-${i}" style="flex:1;cursor:pointer">
                  <div class="stx-name">${esc(s.name)}</div>
                  ${s.notes ? `<div class="stx-note">${esc(s.notes)}</div>` : ""}
                </label>
              </div>`
                )
                .join("")}</div>`
            : `<p style="font-size:13px;color:var(--text-secondary);font-style:italic">אין תתי-משימות למשימה מסוג "${esc(t.taskType)}"</p>`
        }
      </div>
      <div class="modal-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
          <h4 style="margin:0">לוג עדכונים</h4>
          <button class="icon-edit-btn" id="addUpdateBtn">+ עדכון</button>
        </div>
        ${
          log.length
            ? `<div class="log-list">${log
                .map((l) => `<div class="log-entry">${esc(l.note)}<span class="log-meta">${esc(l.author)} · ${formatDateDisplay(l.date) || esc(l.date)}</span></div>`)
                .join("")}</div>`
            : `<div class="log-empty">אין עוד עדכונים למשימה הזו</div>`
        }
      </div>
    </div>
  `);

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("modalEditBtn").addEventListener("click", () => openItemForm("task", taskId));
  document.getElementById("addUpdateBtn").addEventListener("click", () => openUpdateForm("task", taskId));

  const listEl = document.getElementById("modalSubtaskList");
  if (listEl) {
    listEl.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", async () => {
        t.subtasks[+cb.dataset.idx].done = cb.checked;
        await upsert("task", t);
        openTaskDetail(taskId); // רענון המודאל עם התקדמות מעודכנת
        renderAll();
      });
    });
  }
}

// ---- הוספת רשומה ללוג עדכונים ----

export function openUpdateForm(entityType, entityId) {
  const label = entityType === "project" ? "הפרויקט" : "המשימה";
  openModal(`
    <div class="modal-header">
      <h2>+ עדכון ל${label}</h2>
      <button class="modal-close" id="modalCloseBtn" aria-label="סגירה">✕</button>
    </div>
    <div class="modal-body">
      <form id="updateForm" novalidate>
        <div class="form-field">
          <label for="u-note">מה קרה / מה השתנה <span class="req-hint">*</span></label>
          <textarea id="u-note" required></textarea>
        </div>
        <div class="form-grid">
          <div class="form-field"><label for="u-author">מי מעדכן</label><select id="u-author">${optionList(ASSIGNABLE_NAMES, ASSIGNABLE_NAMES[0])}</select></div>
          <div class="form-field"><label for="u-date">תאריך</label><input type="date" id="u-date" value="${escAttr(todayStr())}"></div>
        </div>
        <div class="field-error" id="formError" hidden></div>
        <div class="form-actions">
          <div></div>
          <div class="form-actions-right">
            <button type="button" class="btn-secondary" id="cancelFormBtn">ביטול</button>
            <button type="submit" class="btn-primary">הוספה</button>
          </div>
        </div>
      </form>
    </div>
  `);

  const back = () => (entityType === "task" ? openTaskDetail(entityId) : (closeModal(), renderAll()));
  document.getElementById("modalCloseBtn").addEventListener("click", back);
  document.getElementById("cancelFormBtn").addEventListener("click", back);
  document.getElementById("updateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = document.getElementById("u-note").value.trim();
    const err = document.getElementById("formError");
    if (!note) { err.textContent = "צריך לכתוב מה השתנה."; err.hidden = false; return; }
    await upsert("update", {
      id: nextId("UPD", state.updatesLog.map((u) => u.id)),
      entityType,
      entityId,
      date: document.getElementById("u-date").value || todayStr(),
      author: document.getElementById("u-author").value,
      note,
    });
    renderAll();
    showToast("העדכון נוסף ללוג");
    if (entityType === "task") openTaskDetail(entityId);
    else closeModal();
  });
}

// ---- טופס פיננסים (מדדים מופשטים בלבד) ----

export function openFinanceForm() {
  const f = state.finance || {};
  openModal(`
    <div class="modal-header">
      <h2>💰 תמונת פיננסים</h2>
      <button class="modal-close" id="modalCloseBtn" aria-label="סגירה">✕</button>
    </div>
    <div class="modal-body">
      <form id="financeForm" novalidate>
        <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:6px">
          בכוונה מדדים בודדים בלבד — לא טבלת הוצאות. המספרים נשמרים במכשיר.
        </p>
        <div class="form-grid">
          <div class="form-field"><label for="fin-budget">תקציב פנוי החודש (₪)</label><input type="number" id="fin-budget" value="${f.budgetFree != null ? escAttr(f.budgetFree) : ""}" placeholder="למשל 2500"></div>
          <div class="form-field"><label for="fin-goal">התקדמות ליעד חיסכון (%)</label><input type="number" id="fin-goal" min="0" max="100" value="${f.savingsGoalPct != null ? escAttr(f.savingsGoalPct) : ""}" placeholder="0–100"></div>
        </div>
        <div class="form-field">
          <label for="fin-decisions">החלטות שדורשות את שניכם (שורה לכל החלטה)</label>
          <textarea id="fin-decisions" style="min-height:90px">${esc((f.openDecisions || []).join("\n"))}</textarea>
        </div>
        <div class="field-error" id="formError" hidden></div>
        <div class="form-actions">
          <div></div>
          <div class="form-actions-right">
            <button type="button" class="btn-secondary" id="cancelFormBtn">ביטול</button>
            <button type="submit" class="btn-primary">שמירה</button>
          </div>
        </div>
      </form>
    </div>
  `);

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("cancelFormBtn").addEventListener("click", closeModal);
  document.getElementById("financeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = document.getElementById("fin-budget").value;
    const g = document.getElementById("fin-goal").value;
    const decisions = document.getElementById("fin-decisions").value
      .split("\n").map((s) => s.trim()).filter(Boolean);
    await saveFinance({
      budgetFree: b !== "" ? Number(b) : null,
      savingsGoalPct: g !== "" ? Math.max(0, Math.min(100, Number(g))) : null,
      openDecisions: decisions,
    });
    closeModal();
    renderAll();
    showToast("תמונת הפיננסים עודכנה");
  });
}

// ---- טופסי הוספה/עריכה ----

function subtaskRowHtml(id, name, notes) {
  return `
    <div class="subtask-row" data-existing-id="${escAttr(id || "")}">
      <input type="text" class="stx-name-input" placeholder="שם תת-משימה" value="${escAttr(name || "")}">
      <input type="text" class="stx-notes-input" placeholder="הערה (לא חובה)" value="${escAttr(notes || "")}">
      <button type="button" class="remove-subtask-row" aria-label="הסרה">✕</button>
    </div>`;
}

function formShell(title, bodyHtml, isEdit) {
  return `
    <div class="modal-header">
      <h2>${title}</h2>
      <button class="modal-close" id="modalCloseBtn" aria-label="סגירה">✕</button>
    </div>
    <div class="modal-body">
      <form id="itemForm" novalidate>
        ${bodyHtml}
        <div class="field-error" id="formError" hidden></div>
        <div class="form-actions">
          <div>${isEdit ? `<button type="button" class="btn-danger-text" id="deleteItemBtn">מחיקה</button>` : ""}</div>
          <div class="form-actions-right">
            <button type="button" class="btn-secondary" id="cancelFormBtn">ביטול</button>
            <button type="submit" class="btn-primary">${isEdit ? "שמירה" : "הוספה"}</button>
          </div>
        </div>
      </form>
    </div>`;
}

function taskFormBody(t) {
  const taskType = t.taskType || "חד-פעמית";
  const subtasksHtml = (t.subtasks || []).map((s) => subtaskRowHtml(s.id, s.name, s.notes)).join("");
  return `
    <div class="type-toggle">
      <label class="type-option ${taskType === "חד-פעמית" ? "selected" : ""}">
        <input type="radio" name="taskType" value="חד-פעמית" ${taskType === "חד-פעמית" ? "checked" : ""}> 📌 חד-פעמית
      </label>
      <label class="type-option ${taskType === "תהליכית" ? "selected" : ""}">
        <input type="radio" name="taskType" value="תהליכית" ${taskType === "תהליכית" ? "checked" : ""}> 🧩 תהליכית (עם תתי-משימות)
      </label>
    </div>
    <div class="form-field">
      <label for="f-name">שם המשימה <span class="req-hint">*</span></label>
      <input type="text" id="f-name" required value="${escAttr(t.name || "")}">
    </div>
    <div class="form-grid">
      <div class="form-field"><label for="f-category">תחום</label><select id="f-category">${optionList(CATEGORY_LIST, t.category)}</select></div>
      <div class="form-field"><label for="f-owner">אחראי יחיד <span class="req-hint">*</span></label><select id="f-owner">${optionList(ASSIGNABLE_NAMES, t.owner || ASSIGNABLE_NAMES[0])}</select></div>
      <div class="form-field"><label for="f-status">סטטוס</label><select id="f-status">${STATUS_ORDER.map((s) => `<option value="${s}" ${s === t.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></div>
      <div class="form-field"><label for="f-priority">עדיפות</label><select id="f-priority">${optionList(PRIORITY_OPTIONS, t.priority || "רגיל")}</select></div>
      <div class="form-field"><label for="f-frequency">תדירות</label><select id="f-frequency">${optionList(FREQUENCY_OPTIONS, t.frequency || "חד-פעמי")}</select></div>
      <div class="form-field"><label for="f-dueDate">תאריך יעד</label><input type="date" id="f-dueDate" value="${escAttr(t.dueDate || "")}"></div>
      <div class="form-field"><label for="f-dueTime">שעה</label><input type="time" id="f-dueTime" value="${escAttr(t.dueTime || "")}"></div>
      <div class="form-field"><label for="f-relatedPerson">נוגע ל (לא חובה)</label><select id="f-relatedPerson"><option value="">—</option>${optionList(ALL_PEOPLE_NAMES, t.relatedPerson)}</select></div>
      <div class="form-field"><label for="f-projectId">פרויקט מקושר (לא חובה)</label><select id="f-projectId"><option value="">—</option>${state.projects.map((p) => `<option value="${escAttr(p.id)}" ${p.id === t.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
    </div>
    <div class="form-field"><label for="f-next">השלב הבא (לא חובה)</label><input type="text" id="f-next" value="${escAttr(t.next && t.next !== "—" ? t.next : "")}"></div>
    <div class="modal-section" id="subtaskSection" style="display:${taskType === "תהליכית" ? "block" : "none"}">
      <h4>תתי-משימות</h4>
      <div class="subtask-builder" id="subtaskBuilder">${subtasksHtml}</div>
      <button type="button" class="btn-secondary" id="addSubtaskRowBtn" style="margin-top:8px">+ הוסף תת-משימה</button>
    </div>`;
}

function routineFormBody(r) {
  return `
    <div class="form-field"><label for="f-name">שם השגרה <span class="req-hint">*</span></label><input type="text" id="f-name" required value="${escAttr(r.name || "")}"></div>
    <div class="form-grid">
      <div class="form-field"><label for="f-category">תחום</label><select id="f-category">${optionList(CATEGORY_LIST, r.category)}</select></div>
      <div class="form-field"><label for="f-assignee">אחראי יחיד <span class="req-hint">*</span></label><select id="f-assignee">${optionList(ASSIGNABLE_NAMES, r.assignee || ASSIGNABLE_NAMES[0])}</select></div>
      <div class="form-field"><label for="f-active">פעילה</label><select id="f-active"><option value="true" ${r.active !== false ? "selected" : ""}>כן</option><option value="false" ${r.active === false ? "selected" : ""}>לא</option></select></div>
    </div>
    <div class="form-field"><label for="f-notes">הערות (לא חובה)</label><input type="text" id="f-notes" value="${escAttr(r.notes || "")}"></div>`;
}

function projectFormBody(p) {
  return `
    <div class="form-field"><label for="f-name">שם הפרויקט <span class="req-hint">*</span></label><input type="text" id="f-name" required value="${escAttr(p.name || "")}"></div>
    <div class="form-grid">
      <div class="form-field"><label for="f-category">תחום</label><select id="f-category">${optionList(CATEGORY_LIST, p.category)}</select></div>
      <div class="form-field"><label for="f-owner">אחראי מוביל <span class="req-hint">*</span></label><select id="f-owner">${optionList(ASSIGNABLE_NAMES, p.owner || ASSIGNABLE_NAMES[0])}</select></div>
      <div class="form-field"><label for="f-status">סטטוס</label><select id="f-status">${STATUS_ORDER.map((s) => `<option value="${s}" ${s === p.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></div>
      <div class="form-field"><label for="f-priority">עדיפות</label><select id="f-priority">${optionList(PRIORITY_OPTIONS, p.priority || "רגיל")}</select></div>
      <div class="form-field"><label for="f-target">יעד לסיום (לא חובה)</label><input type="date" id="f-target" value="${escAttr(p.target || "")}"></div>
      <div class="form-field"><label for="f-budget">תקציב (לא חובה)</label><input type="number" id="f-budget" value="${p.budget != null ? escAttr(p.budget) : ""}"></div>
    </div>
    <div class="form-field"><label for="f-notes">הערות (לא חובה)</label><input type="text" id="f-notes" value="${escAttr(p.notes || "")}"></div>`;
}

function shoppingFormBody(s) {
  return `
    <div class="form-field"><label for="f-name">שם הפריט <span class="req-hint">*</span></label><input type="text" id="f-name" required value="${escAttr(s.name || "")}"></div>
    <div class="form-grid">
      <div class="form-field"><label for="f-category">קטגוריה</label><select id="f-category">${optionList(SHOP_CATEGORY_OPTIONS, s.category || "אחר")}</select></div>
      <div class="form-field"><label for="f-qty">כמות</label><input type="text" id="f-qty" value="${escAttr(s.qty || "")}" placeholder="למשל 2 / קרטון"></div>
      <div class="form-field"><label for="f-status">סטטוס</label><select id="f-status">${optionList(SHOP_STATUS_OPTIONS, s.status || "חסר")}</select></div>
      <div class="form-field"><label for="f-store">חנות יעד</label><input type="text" id="f-store" value="${escAttr(s.store || "")}" placeholder="סופר / פארם / …"></div>
    </div>`;
}

const TITLES = {
  task: ["✏️ עריכת משימה", "+ משימה חדשה"],
  routine: ["✏️ עריכת שגרה", "+ שגרה יומית חדשה"],
  project: ["✏️ עריכת פרויקט", "+ פרויקט חדש"],
  shopping: ["✏️ עריכת פריט קניות", "+ פריט קניות"],
};

export function openItemForm(kind, id = null) {
  let existing = null;
  if (id != null) {
    const store = { task: "tasks", routine: "routines", project: "projects", shopping: "shopping" }[kind];
    existing = state[store].find((x) => String(x.id) === String(id)) || null;
  }
  const src = existing || {};
  const body =
    kind === "task" ? taskFormBody(src)
    : kind === "routine" ? routineFormBody(src)
    : kind === "project" ? projectFormBody(src)
    : shoppingFormBody(src);

  openModal(formShell(TITLES[kind][existing ? 0 : 1], body, !!existing));
  wireForm(kind, existing);
}

function wireSubtaskRemoveButtons() {
  document.querySelectorAll(".remove-subtask-row").forEach((btn) => {
    btn.onclick = () => btn.closest(".subtask-row").remove();
  });
}

function wireForm(kind, existing) {
  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("cancelFormBtn").addEventListener("click", closeModal);

  if (kind === "task") {
    const sync = () => {
      const val = document.querySelector('input[name="taskType"]:checked').value;
      document.getElementById("subtaskSection").style.display = val === "תהליכית" ? "block" : "none";
      document.querySelectorAll(".type-option").forEach((el) =>
        el.classList.toggle("selected", el.querySelector("input").value === val)
      );
    };
    document.querySelectorAll('input[name="taskType"]').forEach((r) => r.addEventListener("change", sync));
    document.getElementById("addSubtaskRowBtn").addEventListener("click", () => {
      document.getElementById("subtaskBuilder").insertAdjacentHTML("beforeend", subtaskRowHtml(null, "", ""));
      wireSubtaskRemoveButtons();
    });
    wireSubtaskRemoveButtons();
  }

  if (existing) {
    const delBtn = document.getElementById("deleteItemBtn");
    if (delBtn) wireDeleteButton(delBtn, kind, existing.id);
  }

  document.getElementById("itemForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("formError");
    err.hidden = true;
    try {
      const ok = await saveFromForm(kind, existing);
      if (!ok) return;
      closeModal();
      renderAll();
      showToast(existing ? "העדכון נשמר" : "נוסף בהצלחה");
    } catch (ex) {
      err.textContent = "שגיאה בשמירה: " + (ex && ex.message ? ex.message : ex);
      err.hidden = false;
    }
  });
}

function wireDeleteButton(btn, kind, id) {
  let armed = false;
  let timer = null;
  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = "לאשר מחיקה?";
      timer = setTimeout(() => { armed = false; btn.textContent = "מחיקה"; }, 3000);
    } else {
      clearTimeout(timer);
      await remove(kind === "task" ? "task" : kind === "routine" ? "routine" : kind === "project" ? "project" : "shopping", id);
      closeModal();
      renderAll();
      showToast("נמחק");
    }
  });
}

function val(id) { return document.getElementById(id).value; }
function trimVal(id) { return val(id).trim(); }

async function saveFromForm(kind, existing) {
  const name = trimVal("f-name");
  if (!name) {
    const err = document.getElementById("formError");
    err.textContent = "צריך למלא שם.";
    err.hidden = false;
    return false;
  }

  if (kind === "task") {
    const taskType = document.querySelector('input[name="taskType"]:checked').value;
    let subtasks = [];
    if (taskType === "תהליכית") {
      const prev = existing ? existing.subtasks || [] : [];
      document.querySelectorAll("#subtaskBuilder .subtask-row").forEach((row) => {
        const sName = row.querySelector(".stx-name-input").value.trim();
        if (!sName) return;
        const sNotes = row.querySelector(".stx-notes-input").value.trim();
        const existingId = row.dataset.existingId;
        let sub = existingId ? prev.find((s) => s.id === existingId) : null;
        if (sub) {
          sub = { ...sub, name: sName };
          if (sNotes) sub.notes = sNotes; else delete sub.notes;
        } else {
          sub = { id: nextId("SUB", [...prev.map((s) => s.id), ...subtasks.map((s) => s.id)]), name: sName, done: false };
          if (sNotes) sub.notes = sNotes;
        }
        subtasks.push(sub);
      });
    }
    const owner = val("f-owner"); // select מוגבל ל-לירן/מורן — "אחראי יחיד" נאכף מבנית
    const obj = {
      ...(existing || {}),
      id: existing ? existing.id : nextId("TSK", state.tasks.map((t) => t.id)),
      name,
      category: val("f-category"),
      owner,
      status: val("f-status"),
      taskType,
      dueDate: val("f-dueDate") || null,
      dueTime: val("f-dueTime") || null,
      frequency: val("f-frequency"),
      priority: val("f-priority"),
      next: trimVal("f-next") || "—",
      relatedPerson: val("f-relatedPerson") || null,
      projectId: val("f-projectId") || null,
      subtasks,
    };
    await upsert("task", obj);
  } else if (kind === "routine") {
    const obj = {
      ...(existing || {}),
      id: existing ? existing.id : nextId("ROU", state.routines.map((r) => r.id)),
      name,
      category: val("f-category"),
      assignee: val("f-assignee"),
      active: val("f-active") === "true",
      notes: trimVal("f-notes") || null,
    };
    await upsert("routine", obj);
  } else if (kind === "project") {
    const budgetVal = val("f-budget");
    const obj = {
      ...(existing || {}),
      id: existing ? existing.id : nextId("PRJ", state.projects.map((p) => p.id)),
      name,
      category: val("f-category"),
      owner: val("f-owner"),
      status: val("f-status"),
      priority: val("f-priority"),
      target: val("f-target") || null,
      budget: budgetVal !== "" ? Number(budgetVal) : null,
      notes: trimVal("f-notes") || null,
    };
    await upsert("project", obj);
  } else if (kind === "shopping") {
    const obj = {
      ...(existing || {}),
      name,
      category: val("f-category"),
      qty: trimVal("f-qty"),
      status: val("f-status"),
      store: trimVal("f-store"),
    };
    if (existing) obj.id = existing.id;
    await upsert("shopping", obj);
  }
  return true;
}
