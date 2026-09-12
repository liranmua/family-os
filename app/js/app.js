// Family OS — נקודת כניסה: רישום Service Worker, טעינת state, חיווט UI.

import { loadState, resetAll, upsert, state, setChangeHandler, setSyncHandler } from "./state.js";
import { CATEGORY_LIST, todayStr } from "./constants.js";
import {
  renderAll, renderTasks, setCategoryFilter, getCategoryFilter, setTaskSearchQuery, setRoutineToggleHandler,
} from "./render.js";
import { openItemForm } from "./forms.js";
import { initNotifications, requestPermission } from "./notifications.js";
import { deviceLabel } from "./cloud.js";
import { initAuth, signIn, signOutUser, currentUserName } from "./auth.js";
import { showScreen } from "./nav.js";

const FILTER_CONTAINERS = ["filtersTasks", "filtersRoutines", "filtersProjects"];

let swRegistration = null;

async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    swRegistration = await navigator.serviceWorker.register("sw.js");
    return swRegistration;
  } catch (e) {
    console.warn("SW registration failed:", e);
    return null;
  }
}

function updateSyncLine() {
  const el = document.getElementById("storageLine");
  if (!el) return;
  if (!state.sync.ready) { el.textContent = "טוען מהענן…"; return; }
  const n = state.tasks.length + state.routines.length + state.projects.length + state.shopping.length;
  if (state.sync.pending) el.textContent = `${n} פריטים · שומר…`;
  else if (state.sync.fromCache) el.textContent = `${n} פריטים · מקומי (אין רשת) — יסתנכרן כשתחזור`;
  else el.textContent = `${n} פריטים · מסונכרן בין המכשירים ✓`;
}

// ---- שגרות: סימון "בוצע היום" ----
async function toggleRoutineToday(routineId) {
  const today = todayStr();
  const id = `${routineId}__${today}`;
  const existing = state.routineCompletions.find((c) => c.id === id);
  const done = !(existing && existing.done);
  await upsert("routineCompletion", { id, routineId, date: today, done, by: done ? currentUserName(deviceLabel()) : null });
}

// ---- Google Sign-In (שלב 3, צעד 1 — זיהוי בלבד, לא חוסם נתונים) ----
function renderAuth(user) {
  const signInBtn = document.getElementById("signInBtn");
  const box = document.getElementById("authUser");
  if (user) {
    signInBtn.hidden = true;
    box.hidden = false;
    document.getElementById("authName").textContent = user.displayName || user.email || "מחובר";
    const av = document.getElementById("authAvatar");
    if (user.photoURL) { av.src = user.photoURL; av.hidden = false; } else { av.hidden = true; }
  } else {
    signInBtn.hidden = false;
    box.hidden = true;
  }
}

function wireAuth() {
  document.getElementById("signInBtn").addEventListener("click", async () => {
    const btn = document.getElementById("signInBtn");
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "מתחבר…";
    const res = await signIn();
    btn.disabled = false;
    btn.textContent = prev;
    if (!res.ok && !res.silent) {
      const map = {
        "auth/unauthorized-domain": "הדומיין של האתר עדיין לא מאושר ב-Firebase Auth — צריך להוסיף אותו ב-Console.",
        "auth/operation-not-allowed": "Google Sign-In עדיין לא הופעל ב-Firebase Auth (Console → Authentication).",
        "auth/configuration-not-found": "Firebase Authentication עדיין לא הופעל בפרויקט (Console → Authentication → Get started).",
      };
      toast(map[res.code] || ("התחברות נכשלה: " + res.code), 6000);
    }
  });
  document.getElementById("signOutBtn").addEventListener("click", () => signOutUser());
}

// ---- ניווט: Hub + חזרה + הגדרות ----
function wireNav() {
  document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => showScreen(b.dataset.back || "hub")));
  const settingsBtn = document.getElementById("openSettingsBtn");
  if (settingsBtn) settingsBtn.addEventListener("click", () => showScreen("settings"));
}

// ---- חיפוש משימות (מחווט פעם אחת — כדי לא לאבד פוקוס תוך כדי הקלדה) ----
function wireTaskSearch() {
  const input = document.getElementById("taskSearchInput");
  if (!input) return;
  input.addEventListener("input", (e) => {
    setTaskSearchQuery(e.target.value);
    renderTasks();
  });
}

// ---- פילטר תחום (מופיע בכמה אזורים, כולם על אותו מסנן משותף) ----
function wireFilters() {
  const cats = [...new Set(state.tasks.map((t) => t.category))].filter(Boolean);
  const all = [...new Set([...CATEGORY_LIST, ...cats])];
  const cur = getCategoryFilter();
  FILTER_CONTAINERS.forEach((id) => {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = `
      <select aria-label="סינון לפי תחום">
        <option value="">כל התחומים</option>
        ${all.map((c) => `<option value="${c}" ${c === cur ? "selected" : ""}>${c}</option>`).join("")}
      </select>`;
    container.querySelector("select").addEventListener("change", (e) => {
      setCategoryFilter(e.target.value);
      renderAll();
      syncFilterSelects();
    });
  });
}
function syncFilterSelects() {
  const cur = getCategoryFilter();
  FILTER_CONTAINERS.forEach((id) => {
    const sel = document.querySelector(`#${id} select`);
    if (sel) sel.value = cur;
  });
}

// ---- כפתורי header + toolbar ----
function wireButtons() {
  document.getElementById("addTaskBtn").addEventListener("click", () => openItemForm("task"));
  document.getElementById("addRoutineBtn").addEventListener("click", () => openItemForm("routine"));
  document.getElementById("addShopBtn").addEventListener("click", () => openItemForm("shopping"));

  document.getElementById("enableNotifBtn").addEventListener("click", requestPermission);

  document.getElementById("resetBtn").addEventListener("click", async () => {
    const btn = document.getElementById("resetBtn");
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "לאשר? (מוחק גם אצל מורן)";
      setTimeout(() => { btn.dataset.armed = "0"; btn.textContent = "♻️ אפס הכל"; }, 4000);
      return;
    }
    btn.dataset.armed = "0";
    btn.textContent = "מאפס…";
    await resetAll();
    btn.textContent = "♻️ אפס הכל";
    setCategoryFilter("");
    wireFilters();
    renderAll();
  });

  // התקנת PWA
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__deferredPrompt = e;
    document.getElementById("installBtn").hidden = false;
  });
  document.getElementById("installBtn").addEventListener("click", async () => {
    const dp = window.__deferredPrompt;
    if (!dp) return;
    dp.prompt();
    await dp.userChoice;
    window.__deferredPrompt = null;
    document.getElementById("installBtn").hidden = true;
  });
}

// ---- Overlay: סגירה בלחיצה על הרקע / Escape ----
function wireOverlay() {
  const overlay = document.getElementById("modalOverlay");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.hidden = true; overlay.querySelector("#modal").innerHTML = ""; } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) { overlay.hidden = true; overlay.querySelector("#modal").innerHTML = ""; }
  });
}

function toast(msg, ms = 3500) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

function announceMigration() {
  const m = state.sync.migration;
  if (!m) return;
  if (m.migrated) {
    const n = Object.values(m.counts || {}).reduce((a, b) => a + b, 0);
    toast(`סנכרון בין המכשירים הופעל ✓ — הועלו ${n} פריטים לענן`, 6000);
  } else if (m.reason === "already-initialized") {
    toast("מחובר לנתונים המשותפים ✓", 3000);
  }
}

let _lastCats = "";
function onStateChange() {
  renderAll();
  updateSyncLine();
  // רענון רשימת הפילטר אם נוספו/נעלמו תחומים
  const cats = [...new Set(state.tasks.map((t) => t.category))].filter(Boolean).sort().join("|");
  if (cats !== _lastCats) { _lastCats = cats; wireFilters(); }
}

async function main() {
  const reg = await registerSW();

  setChangeHandler(onStateChange);
  setSyncHandler(updateSyncLine);
  setRoutineToggleHandler(toggleRoutineToday);

  wireNav();
  wireButtons();
  wireTaskSearch();
  wireOverlay();
  wireAuth();
  initAuth(renderAuth).catch((e) => console.warn("initAuth failed:", e));

  await loadState();
  wireFilters();
  onStateChange();
  announceMigration();

  await initNotifications(reg || (await navigator.serviceWorker?.ready.catch(() => null)));
}

main();
