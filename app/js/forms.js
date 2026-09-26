// Family OS — מודאל פירוט משימה + טופסי הוספה/עריכה/מחיקה.
// מבוסס family_hub_dashboard.html. כל שמירה עוברת דרך state.js (write-through ל-IndexedDB).

import { state, upsert, remove, saveFinance } from "./state.js";
import { deviceLabel } from "./cloud.js";
import { toast as showToast } from "./toast.js";
import {
  CATEGORY_LIST, ASSIGNABLE_NAMES, ALL_PEOPLE_NAMES, STATUS_LABEL, STATUS_CLASS, STATUS_ORDER,
  TYPE_META, PRIORITY_OPTIONS, FREQUENCY_OPTIONS, SHOP_STATUS_OPTIONS, SHOP_CATEGORY_OPTIONS, SHOP_STORE_TYPES,
  DAY_NAMES, optionList, formatDateDisplay, nextId, todayStr, esc, escAttr,
} from "./constants.js";
import { renderAll, projectProgress, subtaskProgress, getActiveStoreType } from "./render.js";
import { showScreen } from "./nav.js";
import {
  fetchCalendarList as calFetchCalendarList, getAllCalendars as calGetAllCalendars,
  getSelectedCalendarIds as calGetSelectedCalendarIds, setSelectedCalendarIds as calSetSelectedCalendarIds,
} from "./calendar.js";
import { pickFile as drivePickFile, getFolderId as driveGetFolderId } from "./drive.js";

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
    ["מוביל", t.owner],
    ["גם רלוונטי ל", t.alsoRelevantTo && t.alsoRelevantTo.length ? t.alsoRelevantTo.join(", ") : "—"],
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

// ---- הגדרות יומן: אילו יומני גוגל מוצגים ----

export async function openCalendarSettingsForm() {
  openModal(`
    <div class="modal-header"><h2>📋 יומנים מוצגים</h2><button class="modal-close" id="modalCloseBtn" aria-label="סגירה">✕</button></div>
    <div class="modal-body"><div class="log-empty">טוען רשימת יומנים…</div></div>
  `);
  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  await calFetchCalendarList();
  renderCalendarSettingsBody();
}

function renderCalendarSettingsBody() {
  const cals = calGetAllCalendars();
  const selected = new Set(calGetSelectedCalendarIds());
  modalEl().innerHTML = `
    <div class="modal-header"><h2>📋 יומנים מוצגים</h2><button class="modal-close" id="modalCloseBtn" aria-label="סגירה">✕</button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--text-secondary)">רק אירועים מהיומנים המסומנים יוצגו באפליקציה (קריאה בלבד — לא משפיע על היומן עצמו).</p>
      ${
        cals.length
          ? `<div class="checkbox-group" style="flex-direction:column;align-items:flex-start;gap:10px">
              ${cals
                .map(
                  (c) => `
                <label><input type="checkbox" class="cal-select-cb" value="${escAttr(c.id)}" ${selected.has(c.id) ? "checked" : ""}> ${esc(c.summary)}${c.primary ? " (ראשי)" : ""}</label>`
                )
                .join("")}
            </div>`
          : `<div class="log-empty">לא נמצאו יומנים בחשבון.</div>`
      }
      <div class="form-actions">
        <div></div>
        <div class="form-actions-right">
          <button type="button" class="btn-secondary" id="calSettingsCancel">ביטול</button>
          <button type="button" class="btn-primary" id="calSettingsSave">שמירה</button>
        </div>
      </div>
    </div>`;
  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("calSettingsCancel").addEventListener("click", closeModal);
  document.getElementById("calSettingsSave").addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".cal-select-cb:checked")].map((cb) => cb.value);
    await calSetSelectedCalendarIds(ids);
    closeModal();
    showToast("רשימת היומנים נשמרה");
  });
}

// ---- מסך פרויקט מלא (drill-in) ----

let _openProjectId = null;

export function openProjectDetail(projectId) {
  _openProjectId = projectId;
  showScreen("project-detail");
  renderProjectDetailBody();
}

// נקרא מ-renderAll() כדי לרענן את מסך הפרויקט אם הוא פתוח (למשל אחרי סימון V על משימה)
export function refreshProjectDetailIfOpen() {
  if (_openProjectId && state.projects.some((p) => p.id === _openProjectId)) renderProjectDetailBody();
}

function renderProjectDetailBody() {
  const p = state.projects.find((x) => x.id === _openProjectId);
  if (!p) return;
  const prog = projectProgress(p);
  const linkedTasks = state.tasks.filter((t) => t.projectId === p.id);
  const linkedShopping = state.shopping.filter((s) => s.linkedProjectId === p.id);
  const packingItems = p.packingItems || [];
  const places = p.places || [];
  const log = state.updatesLog.filter((u) => u.entityType === "project" && u.entityId === p.id);
  const links = p.links || [];

  document.getElementById("pdTitle").textContent = `🧩 ${p.name}`;
  document.getElementById("projectDetailBody").innerHTML = `
    <div class="toolbar-row" style="justify-content:space-between;align-items:center">
      <span class="badge status-pill ${STATUS_CLASS[p.status]}">${STATUS_LABEL[p.status]}</span>
      <button class="icon-edit-btn" id="pdEditBtn">✏️ עריכה</button>
    </div>
    <div class="modal-meta-grid" style="margin:14px 0">
      <div class="meta-item"><div class="k">מוביל</div><div class="v">${esc(p.owner)}</div></div>
      <div class="meta-item"><div class="k">תחום</div><div class="v">${esc(p.category)}</div></div>
      <div class="meta-item"><div class="k">עדיפות</div><div class="v">${esc(p.priority)}</div></div>
      ${p.target ? `<div class="meta-item"><div class="k">יעד</div><div class="v">${formatDateDisplay(p.target)}</div></div>` : ""}
      ${p.budget != null && p.budget !== "" ? `<div class="meta-item"><div class="k">תקציב</div><div class="v">₪${esc(p.budget)}</div></div>` : ""}
    </div>
    <div class="progress-row">
      <div class="progress-track"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
      <span class="progress-label">${prog.done}/${prog.total} משימות הושלמו · ${prog.pct}%</span>
    </div>

    <div class="modal-section">
      <h4>משימות בפרויקט</h4>
      ${
        linkedTasks.length
          ? `<div class="subtask-list" id="pdTaskList">${linkedTasks
              .map(
                (t) => `
            <div class="subtask-item ${t.status === "done" ? "done" : ""}">
              <input type="checkbox" data-task-id="${esc(t.id)}" ${t.status === "done" ? "checked" : ""} id="pdt-${esc(t.id)}">
              <label for="pdt-${esc(t.id)}" style="flex:1;cursor:pointer">
                <div class="stx-name">${esc(t.name)}</div>
                <div class="stx-note">${esc(t.owner)} · ${STATUS_LABEL[t.status]}</div>
              </label>
              <button class="icon-edit-btn" data-open-task="${esc(t.id)}" aria-label="פתיחת המשימה">↗</button>
            </div>`
              )
              .join("")}</div>`
          : `<p style="font-size:13px;color:var(--text-secondary);font-style:italic">אין עדיין משימות מקושרות לפרויקט הזה</p>`
      }
    </div>

    <div class="modal-section">
      <h4>פריטי קניות לפרויקט</h4>
      ${
        linkedShopping.length
          ? `<div class="subtask-list" id="pdShopList">${linkedShopping
              .map(
                (s) => `
            <div class="subtask-item ${s.status === "במלאי" ? "done" : ""}">
              <input type="checkbox" data-shop-id="${esc(s.id)}" ${s.status === "במלאי" ? "checked" : ""} id="pds-${esc(s.id)}">
              <label for="pds-${esc(s.id)}" style="flex:1;cursor:pointer">
                <div class="stx-name">${esc(s.name)}</div>
                <div class="stx-note">${esc(s.storeType)}${s.qty ? " · " + esc(s.qty) : ""}</div>
              </label>
              <button class="icon-edit-btn" data-open-shop="${esc(s.id)}" aria-label="פתיחת הפריט">↗</button>
            </div>`
              )
              .join("")}</div>`
          : `<p style="font-size:13px;color:var(--text-secondary);font-style:italic">אין עדיין פריטי קניות מתויגים לפרויקט הזה</p>`
      }
    </div>

    <div class="modal-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
        <h4 style="margin:0">רשימת אריזה</h4>
        <button class="icon-edit-btn" id="pdAddPackBtn">+ פריט</button>
      </div>
      <div id="pdPackForm" hidden>
        <div class="form-field"><input type="text" id="pd-pack-name" placeholder="שם הפריט"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn-secondary" id="pdPackCancel">ביטול</button>
          <button type="button" class="btn-primary" id="pdPackSave">הוספה</button>
        </div>
      </div>
      ${
        packingItems.length
          ? `<div class="subtask-list" id="pdPackList">${packingItems
              .map(
                (it) => `
            <div class="subtask-item ${it.packed ? "done" : ""}">
              <input type="checkbox" data-pack-id="${esc(it.id)}" ${it.packed ? "checked" : ""} id="pdp-${esc(it.id)}">
              <label for="pdp-${esc(it.id)}" style="flex:1;cursor:pointer">
                <div class="stx-name">${esc(it.name)}</div>
              </label>
              <label class="pack-needbuy" style="display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--text-secondary);cursor:pointer">
                <input type="checkbox" data-needbuy-pack="${esc(it.id)}" ${it.needsBuy ? "checked" : ""}> צריך לקנות
              </label>
              <button class="icon-edit-btn" data-del-pack="${esc(it.id)}" aria-label="הסרה">✕</button>
            </div>`
              )
              .join("")}</div>`
          : `<div class="log-empty" id="pdNoPack">אין עדיין פריטים ברשימת האריזה</div>`
      }
    </div>

    <div class="modal-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
        <h4 style="margin:0">מקומות מומלצים</h4>
        <button class="icon-edit-btn" id="pdAddPlaceBtn">+ מקום</button>
      </div>
      <div id="pdPlaceForm" hidden>
        <div class="form-field"><label for="pd-place-name">שם המקום <span class="req-hint">*</span></label><input type="text" id="pd-place-name" placeholder="למשל: מעיין חרוד"></div>
        <div class="form-field"><label for="pd-place-url">קישור (לא חובה)</label><input type="text" id="pd-place-url" placeholder="https://..."></div>
        <div class="form-field"><label for="pd-place-notes">הערות (לא חובה)</label><textarea id="pd-place-notes" placeholder="למה מומלץ, מתי היינו, מה לזכור..."></textarea></div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn-secondary" id="pdPlaceCancel">ביטול</button>
          <button type="button" class="btn-primary" id="pdPlaceSave">שמירה</button>
        </div>
      </div>
      ${
        places.length
          ? `<div id="pdPlacesList">${places
              .map(
                (pl) => `
            <div class="linkrow" style="align-items:flex-start">
              <div style="flex:1">
                <div style="font-weight:600;font-size:13px">📍 ${esc(pl.name)}${pl.url ? ` · <a href="${escAttr(pl.url)}" target="_blank" rel="noopener noreferrer">🔗 קישור</a>` : ""}</div>
                ${pl.notes ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;white-space:pre-wrap">${esc(pl.notes)}</div>` : ""}
              </div>
              <button class="icon-edit-btn" data-edit-place="${esc(pl.id)}" aria-label="עריכת מקום">✏️</button>
              <button class="icon-edit-btn" data-del-place="${esc(pl.id)}" aria-label="הסרת מקום">✕</button>
            </div>`
              )
              .join("")}</div>`
          : `<div class="log-empty" id="pdNoPlaces">אין עדיין מקומות מומלצים</div>`
      }
    </div>

    <div class="modal-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
        <h4 style="margin:0">קבצים מצורפים</h4>
        <div style="display:flex;gap:6px">
          <button class="icon-edit-btn" id="pdAddDriveBtn">📎 מ-Drive</button>
          <button class="icon-edit-btn" id="pdAddLinkBtn">+ קישור</button>
        </div>
      </div>
      <div id="pdLinkForm" hidden>
        <div class="form-grid">
          <div class="form-field"><label for="pd-link-title">כותרת</label><input type="text" id="pd-link-title" placeholder="למשל: לוח השראה"></div>
          <div class="form-field"><label for="pd-link-url">כתובת</label><input type="text" id="pd-link-url" placeholder="https://..."></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn-secondary" id="pdLinkCancel">ביטול</button>
          <button type="button" class="btn-primary" id="pdLinkSave">הוספה</button>
        </div>
      </div>
      ${
        links.length
          ? `<div id="pdLinksList">${links
              .map(
                (l) => `
            <div class="linkrow">
              <a href="${escAttr(l.url)}" target="_blank" rel="noopener noreferrer">${
                  l.source === "drive"
                    ? `<img src="${escAttr(l.iconUrl || "")}" alt="" class="linkrow-icon">`
                    : "🔗"
                } ${esc(l.title || l.url)}</a>
              <button class="icon-edit-btn" data-del-link="${esc(l.id)}" aria-label="הסרת קישור">✕</button>
            </div>`
              )
              .join("")}</div>`
          : `<div class="log-empty" id="pdNoLinks">אין עדיין קבצים מצורפים</div>`
      }
    </div>

    <div class="modal-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
        <h4 style="margin:0">לוג עדכונים</h4>
        <button class="icon-edit-btn" id="pdAddUpdateBtn">+ עדכון</button>
      </div>
      ${
        log.length
          ? `<div class="log-list">${log
              .map((l) => `<div class="log-entry">${esc(l.note)}<span class="log-meta">${esc(l.author)} · ${formatDateDisplay(l.date) || esc(l.date)}</span></div>`)
              .join("")}</div>`
          : `<div class="log-empty">אין עוד עדכונים לפרויקט הזה</div>`
      }
    </div>
  `;

  wireProjectDetailEvents(p);
}

function wireProjectDetailEvents(p) {
  document.getElementById("pdEditBtn").addEventListener("click", () => openItemForm("project", p.id));
  document.getElementById("pdAddUpdateBtn").addEventListener("click", () => openUpdateForm("project", p.id));

  document.querySelectorAll("[data-open-task]").forEach((btn) =>
    btn.addEventListener("click", () => openTaskDetail(btn.dataset.openTask))
  );
  document.querySelectorAll("#pdTaskList input[type=checkbox]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const t = state.tasks.find((x) => x.id === cb.dataset.taskId);
      if (!t) return;
      await upsert("task", { ...t, status: cb.checked ? "done" : "todo" });
    })
  );

  document.querySelectorAll("[data-open-shop]").forEach((btn) =>
    btn.addEventListener("click", () => openItemForm("shopping", btn.dataset.openShop))
  );
  document.querySelectorAll("#pdShopList input[type=checkbox]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const s = state.shopping.find((x) => x.id === cb.dataset.shopId);
      if (!s) return;
      await upsert("shopping", { ...s, status: cb.checked ? "במלאי" : "חסר" });
    })
  );

  const addPackBtn = document.getElementById("pdAddPackBtn");
  const packForm = document.getElementById("pdPackForm");
  addPackBtn.addEventListener("click", () => { packForm.hidden = false; addPackBtn.hidden = true; });
  document.getElementById("pdPackCancel").addEventListener("click", () => { packForm.hidden = true; addPackBtn.hidden = false; });
  document.getElementById("pdPackSave").addEventListener("click", async () => {
    const name = document.getElementById("pd-pack-name").value.trim();
    if (!name) return;
    const packingItems = [...(p.packingItems || []), { id: nextId("PCK", (p.packingItems || []).map((x) => x.id)), name, packed: false }];
    await upsert("project", { ...p, packingItems });
  });
  document.querySelectorAll("#pdPackList input[data-pack-id]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const packingItems = (p.packingItems || []).map((it) => (it.id === cb.dataset.packId ? { ...it, packed: cb.checked } : it));
      await upsert("project", { ...p, packingItems });
    })
  );
  document.querySelectorAll("[data-del-pack]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const packingItems = (p.packingItems || []).filter((it) => it.id !== btn.dataset.delPack);
      await upsert("project", { ...p, packingItems });
    })
  );
  // "צריך לקנות" על פריט אריזה: יוצר/מוחק אוטומטית פריט קניות מקושר (ראו חלק ג'
  // ב-Family_OS_Shopping_Project_Tag_Brief.md) — שימוש חוזר מלא במנגנון התיוג של חלק א'.
  document.querySelectorAll("#pdPackList input[data-needbuy-pack]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const items = p.packingItems || [];
      const it = items.find((x) => x.id === cb.dataset.needbuyPack);
      if (!it) return;
      if (cb.checked) {
        if (it.linkedShoppingId) return; // כבר קיים קישור — לא משכפלים
        const shopItem = await upsert("shopping", {
          name: it.name,
          storeType: "בית-אחר",
          category: "אחר",
          qty: "",
          status: "חסר",
          linkedProjectId: p.id,
          addedBy: deviceLabel(),
        });
        const packingItems = items.map((x) => (x.id === it.id ? { ...x, needsBuy: true, linkedShoppingId: shopItem.id } : x));
        await upsert("project", { ...p, packingItems });
      } else {
        const linked = it.linkedShoppingId ? state.shopping.find((s) => s.id === it.linkedShoppingId) : null;
        if (linked && linked.status !== "במלאי") await remove("shopping", linked.id); // עדיין לא נקנה בפועל — מוחקים
        const packingItems = items.map((x) => (x.id === it.id ? { ...x, needsBuy: false, linkedShoppingId: null } : x));
        await upsert("project", { ...p, packingItems });
      }
    })
  );

  // ---- מקומות מומלצים ----
  const addPlaceBtn = document.getElementById("pdAddPlaceBtn");
  const placeForm = document.getElementById("pdPlaceForm");
  const placeNameInput = document.getElementById("pd-place-name");
  const placeUrlInput = document.getElementById("pd-place-url");
  const placeNotesInput = document.getElementById("pd-place-notes");
  let editingPlaceId = null;

  const openPlaceForm = (place) => {
    editingPlaceId = place ? place.id : null;
    placeNameInput.value = place ? place.name || "" : "";
    placeUrlInput.value = place ? place.url || "" : "";
    placeNotesInput.value = place ? place.notes || "" : "";
    placeForm.hidden = false;
    addPlaceBtn.hidden = true;
  };
  const closePlaceForm = () => { placeForm.hidden = true; addPlaceBtn.hidden = false; editingPlaceId = null; };

  addPlaceBtn.addEventListener("click", () => openPlaceForm(null));
  document.getElementById("pdPlaceCancel").addEventListener("click", closePlaceForm);
  document.getElementById("pdPlaceSave").addEventListener("click", async () => {
    const name = placeNameInput.value.trim();
    if (!name) return;
    let url = placeUrlInput.value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    const notes = placeNotesInput.value.trim();
    const existingPlaces = p.places || [];
    const places = editingPlaceId
      ? existingPlaces.map((pl) => (pl.id === editingPlaceId ? { ...pl, name, url: url || null, notes: notes || null } : pl))
      : [...existingPlaces, { id: nextId("PLC", existingPlaces.map((pl) => pl.id)), name, url: url || null, notes: notes || null }];
    await upsert("project", { ...p, places });
  });
  document.querySelectorAll("[data-edit-place]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const place = (p.places || []).find((pl) => pl.id === btn.dataset.editPlace);
      if (place) openPlaceForm(place);
    })
  );
  document.querySelectorAll("[data-del-place]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const places = (p.places || []).filter((pl) => pl.id !== btn.dataset.delPlace);
      await upsert("project", { ...p, places });
    })
  );

  document.getElementById("pdAddDriveBtn").addEventListener("click", () => {
    if (!driveGetFolderId()) { showToast("קודם לבחור תיקיית Drive בהגדרות"); return; }
    drivePickFile(async (file) => {
      const links = [
        ...(p.links || []),
        { id: nextId("LNK", (p.links || []).map((l) => l.id)), title: file.name, url: file.url, source: "drive", iconUrl: file.iconUrl },
      ];
      await upsert("project", { ...p, links });
    });
  });

  const addBtn = document.getElementById("pdAddLinkBtn");
  const linkForm = document.getElementById("pdLinkForm");
  addBtn.addEventListener("click", () => { linkForm.hidden = false; addBtn.hidden = true; });
  document.getElementById("pdLinkCancel").addEventListener("click", () => { linkForm.hidden = true; addBtn.hidden = false; });
  document.getElementById("pdLinkSave").addEventListener("click", async () => {
    const title = document.getElementById("pd-link-title").value.trim();
    let url = document.getElementById("pd-link-url").value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const links = [...(p.links || []), { id: nextId("LNK", (p.links || []).map((l) => l.id)), title: title || url, url }];
    await upsert("project", { ...p, links });
  });
  document.querySelectorAll("[data-del-link]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const links = (p.links || []).filter((l) => l.id !== btn.dataset.delLink);
      await upsert("project", { ...p, links });
    })
  );
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
      <div class="form-field"><label for="f-owner">מוביל <span class="req-hint">*</span></label><select id="f-owner">${optionList(ASSIGNABLE_NAMES, t.owner || ASSIGNABLE_NAMES[0])}</select></div>
      <div class="form-field"><label for="f-status">סטטוס</label><select id="f-status">${STATUS_ORDER.map((s) => `<option value="${s}" ${s === t.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></div>
      <div class="form-field"><label for="f-priority">עדיפות</label><select id="f-priority">${optionList(PRIORITY_OPTIONS, t.priority || "רגיל")}</select></div>
      <div class="form-field"><label for="f-frequency">תדירות</label><select id="f-frequency">${optionList(FREQUENCY_OPTIONS, t.frequency || "חד-פעמי")}</select></div>
      <div class="form-field"><label for="f-dueDate">תאריך יעד</label><input type="date" id="f-dueDate" value="${escAttr(t.dueDate || "")}"></div>
      <div class="form-field"><label for="f-dueTime">שעה</label><input type="time" id="f-dueTime" value="${escAttr(t.dueTime || "")}"></div>
      <div class="form-field"><label for="f-relatedPerson">נוגע ל (לא חובה)</label><select id="f-relatedPerson"><option value="">—</option>${optionList(ALL_PEOPLE_NAMES, t.relatedPerson)}</select></div>
      <div class="form-field"><label for="f-projectId">פרויקט מקושר (לא חובה)</label><select id="f-projectId"><option value="">—</option>${state.projects.map((p) => `<option value="${escAttr(p.id)}" ${p.id === t.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
    </div>
    <div class="form-field">
      <label>גם רלוונטי ל (לא חובה, אפשר יותר מאחד)</label>
      <div class="checkbox-group">
        ${ASSIGNABLE_NAMES.map((name) => `
          <label><input type="checkbox" class="also-relevant-cb" value="${escAttr(name)}" ${(t.alsoRelevantTo || []).includes(name) ? "checked" : ""}> ${esc(name)}</label>
        `).join("")}
      </div>
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
      <div class="form-field"><label for="f-assignee">מוביל <span class="req-hint">*</span></label><select id="f-assignee">${optionList(ASSIGNABLE_NAMES, r.assignee || ASSIGNABLE_NAMES[0])}</select></div>
      <div class="form-field"><label for="f-active">פעילה</label><select id="f-active"><option value="true" ${r.active !== false ? "selected" : ""}>כן</option><option value="false" ${r.active === false ? "selected" : ""}>לא</option></select></div>
    </div>
    <div class="form-field"><label for="f-notes">הערות (לא חובה)</label><input type="text" id="f-notes" value="${escAttr(r.notes || "")}"></div>`;
}

function projectFormBody(p) {
  return `
    <div class="form-field"><label for="f-name">שם הפרויקט <span class="req-hint">*</span></label><input type="text" id="f-name" required value="${escAttr(p.name || "")}"></div>
    <div class="form-grid">
      <div class="form-field"><label for="f-category">תחום</label><select id="f-category">${optionList(CATEGORY_LIST, p.category)}</select></div>
      <div class="form-field"><label for="f-owner">מוביל <span class="req-hint">*</span></label><select id="f-owner">${optionList(ASSIGNABLE_NAMES, p.owner || ASSIGNABLE_NAMES[0])}</select></div>
      <div class="form-field"><label for="f-status">סטטוס</label><select id="f-status">${STATUS_ORDER.map((s) => `<option value="${s}" ${s === p.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></div>
      <div class="form-field"><label for="f-priority">עדיפות</label><select id="f-priority">${optionList(PRIORITY_OPTIONS, p.priority || "רגיל")}</select></div>
      <div class="form-field"><label for="f-target">יעד לסיום (לא חובה)</label><input type="date" id="f-target" value="${escAttr(p.target || "")}"></div>
      <div class="form-field"><label for="f-budget">תקציב (לא חובה)</label><input type="number" id="f-budget" value="${p.budget != null ? escAttr(p.budget) : ""}"></div>
    </div>
    <div class="form-field"><label for="f-notes">הערות (לא חובה)</label><input type="text" id="f-notes" value="${escAttr(p.notes || "")}"></div>`;
}

function shoppingFormBody(s) {
  const storeType = s.storeType || getActiveStoreType();
  return `
    <div class="form-field"><label for="f-name">שם הפריט <span class="req-hint">*</span></label><input type="text" id="f-name" required value="${escAttr(s.name || "")}"></div>
    <div class="form-grid">
      <div class="form-field"><label for="f-storeType">רשימה</label><select id="f-storeType">${optionList(SHOP_STORE_TYPES, storeType)}</select></div>
      <div class="form-field"><label for="f-category">קטגוריה</label><select id="f-category">${optionList(SHOP_CATEGORY_OPTIONS, s.category || "אחר")}</select></div>
      <div class="form-field"><label for="f-qty">כמות</label><input type="text" id="f-qty" value="${escAttr(s.qty || "")}" placeholder="למשל 2 / קרטון"></div>
      <div class="form-field"><label for="f-price">מחיר ליחידה (₪, לא חובה)</label><input type="number" id="f-price" step="0.1" min="0" value="${s.price != null ? escAttr(s.price) : ""}" placeholder="למשל 12.90"></div>
      <div class="form-field"><label for="f-status">סטטוס</label><select id="f-status">${optionList(SHOP_STATUS_OPTIONS, s.status || "חסר")}</select></div>
    </div>
    <div class="form-field"><label for="f-linkedProjectId">שייך לפרויקט (לא חובה)</label><select id="f-linkedProjectId"><option value="">—</option>${state.projects.map((p) => `<option value="${escAttr(p.id)}" ${p.id === s.linkedProjectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
    <div class="form-field"><label for="f-notes">הערות (לא חובה)</label><input type="text" id="f-notes" value="${escAttr(s.notes || "")}" placeholder="למשל: הסוג האורגני"></div>`;
}

function weeklyBlockFormBody(b) {
  return `
    <div class="form-field"><label for="f-name">כותרת <span class="req-hint">*</span></label><input type="text" id="f-name" required value="${escAttr(b.title || "")}"></div>
    <div class="form-grid">
      <div class="form-field"><label for="f-day">יום בשבוע</label><select id="f-day">${DAY_NAMES.map((d, i) => `<option value="${i}" ${i === (b.dayOfWeek ?? 0) ? "selected" : ""}>${d}</option>`).join("")}</select></div>
      <div class="form-field"><label for="f-leader">מוביל <span class="req-hint">*</span></label><select id="f-leader">${optionList(ASSIGNABLE_NAMES, b.leader || ASSIGNABLE_NAMES[0])}</select></div>
      <div class="form-field"><label for="f-start">שעת התחלה</label><input type="time" id="f-start" value="${escAttr(b.startTime || "")}"></div>
      <div class="form-field"><label for="f-end">שעת סיום</label><input type="time" id="f-end" value="${escAttr(b.endTime || "")}"></div>
      <div class="form-field"><label for="f-category">תחום (לא חובה)</label><select id="f-category"><option value="">—</option>${optionList(CATEGORY_LIST, b.category)}</select></div>
    </div>
    <div class="form-field"><label for="f-notes">הערות (לא חובה)</label><input type="text" id="f-notes" value="${escAttr(b.notes || "")}"></div>
    <p style="font-size:11.5px;color:var(--text-secondary)">בלוק פנימי בלבד — לא נכתב ל-Google Calendar, רק מוצג יחד עם היומן האמיתי.</p>`;
}

const TITLES = {
  task: ["✏️ עריכת משימה", "+ משימה חדשה"],
  routine: ["✏️ עריכת שגרה", "+ שגרה יומית חדשה"],
  weeklyBlock: ["✏️ עריכת בלוק שבועי", "+ בלוק שבועי"],
  project: ["✏️ עריכת פרויקט", "+ פרויקט חדש"],
  shopping: ["✏️ עריכת פריט קניות", "+ פריט קניות"],
};

export function openItemForm(kind, id = null) {
  let existing = null;
  if (id != null) {
    const store = { task: "tasks", routine: "routines", project: "projects", shopping: "shopping", weeklyBlock: "weeklyBlocks" }[kind];
    existing = state[store].find((x) => String(x.id) === String(id)) || null;
  }
  const src = existing || {};
  const body =
    kind === "task" ? taskFormBody(src)
    : kind === "routine" ? routineFormBody(src)
    : kind === "project" ? projectFormBody(src)
    : kind === "weeklyBlock" ? weeklyBlockFormBody(src)
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
      await remove(kind, id); // kind כבר תואם למפתחות ה-entity ב-state.js (task/routine/project/shopping/weeklyBlock)
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
    const owner = val("f-owner"); // select מוגבל ל-לירן/מורן — שדה "מוביל" יחיד וחובה, נאכף מבנית
    const alsoRelevantTo = [...document.querySelectorAll(".also-relevant-cb:checked")].map((cb) => cb.value);
    const obj = {
      ...(existing || {}),
      id: existing ? existing.id : nextId("TSK", state.tasks.map((t) => t.id)),
      name,
      category: val("f-category"),
      owner,
      alsoRelevantTo,
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
    const priceVal = val("f-price");
    const obj = {
      ...(existing || {}),
      name,
      storeType: val("f-storeType"),
      category: val("f-category"),
      qty: trimVal("f-qty"),
      price: priceVal !== "" ? Number(priceVal) : null,
      notes: trimVal("f-notes") || null,
      status: val("f-status"),
      linkedProjectId: val("f-linkedProjectId") || null,
    };
    if (existing) obj.id = existing.id;
    else obj.addedBy = deviceLabel(); // לזיהוי "מכשיר אחר הוסיף" בהתראות (ראו notifications.js) — לא שדה בטופס
    await upsert("shopping", obj);
  } else if (kind === "weeklyBlock") {
    const obj = {
      ...(existing || {}),
      id: existing ? existing.id : nextId("WKB", state.weeklyBlocks.map((b) => b.id)),
      title: name,
      dayOfWeek: Number(val("f-day")),
      startTime: val("f-start") || null,
      endTime: val("f-end") || null,
      leader: val("f-leader"),
      category: val("f-category") || null,
      notes: trimVal("f-notes") || null,
    };
    await upsert("weeklyBlock", obj);
  }
  return true;
}
