// Family OS — נקודת כניסה: רישום Service Worker, טעינת state, חיווט UI.

import { loadState, resetAll, upsert, state } from "./state.js";
import { CATEGORY_LIST, todayStr } from "./constants.js";
import {
  renderAll, setCategoryFilter, setRoutineToggleHandler, renderRoutines, renderKpis,
} from "./render.js";
import { openItemForm } from "./forms.js";
import { initNotifications, requestPermission } from "./notifications.js";
import { initSyncCheck } from "./sync-check.js";

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

function updateStorageLine() {
  const el = document.getElementById("storageLine");
  const n =
    state.tasks.length + state.routines.length + state.projects.length + state.shopping.length;
  el.textContent = `${n} פריטים נשמרים ב-IndexedDB במכשיר הזה`;
}

// ---- שגרות: סימון "בוצע היום" ----
async function toggleRoutineToday(routineId) {
  const today = todayStr();
  let entry = state.routineCompletions.find((c) => c.routineId === routineId && c.date === today);
  if (!entry) {
    entry = { routineId, date: today, done: true, by: "לירן" };
    await upsert("routineCompletion", entry);
  } else {
    entry.done = !entry.done;
    entry.by = entry.done ? "לירן" : null;
    await upsert("routineCompletion", entry);
  }
  renderRoutines(toggleRoutineToday);
  renderKpis();
  updateStorageLine();
}

// ---- טאבים ----
function wireTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    const activate = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("sec-" + tab.dataset.tab).classList.add("active");
    };
    tab.addEventListener("click", activate);
    tab.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
  });
}

// ---- פילטר תחום ----
function wireFilters() {
  const cats = [...new Set(state.tasks.map((t) => t.category))].filter(Boolean);
  const all = [...new Set([...CATEGORY_LIST, ...cats])];
  document.getElementById("filters").innerHTML = `
    <select id="catFilter" aria-label="סינון לפי תחום">
      <option value="">כל התחומים</option>
      ${all.map((c) => `<option value="${c}">${c}</option>`).join("")}
    </select>`;
  document.getElementById("catFilter").addEventListener("change", (e) => {
    setCategoryFilter(e.target.value);
    renderAll();
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
      btn.textContent = "לאשר איפוס?";
      setTimeout(() => { btn.dataset.armed = "0"; btn.textContent = "♻️ אפס הכל"; }, 3000);
      return;
    }
    btn.dataset.armed = "0";
    btn.textContent = "♻️ אפס הכל";
    await resetAll({ reseed: true });
    setCategoryFilter("");
    wireFilters();
    renderAll();
    updateStorageLine();
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

async function main() {
  const reg = await registerSW();
  await loadState();

  setRoutineToggleHandler(toggleRoutineToday);
  wireTabs();
  wireFilters();
  wireButtons();
  wireOverlay();
  renderAll();
  updateStorageLine();

  await initNotifications(reg || (await navigator.serviceWorker?.ready.catch(() => null)));

  // שלב 2 — צעד ראשון: בדיקת חיבור Firestore (עדיין לא מחליף את שכבת הנתונים).
  try {
    initSyncCheck();
  } catch (e) {
    const s = document.getElementById("syncStatus");
    if (s) s.textContent = "Firestore: לא נטען — " + (e && e.message ? e.message : e);
  }
}

main();
