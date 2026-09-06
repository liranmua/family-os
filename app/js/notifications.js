// Family OS — התראות מקומיות בלבד (שלב 1).
// לא Push-שרת. התזכורות נבדקות בטעינת האפליקציה וכל 60 שניות בזמן שהיא פתוחה/ברקע.
// כשנתמך — נרשם גם TimestampTrigger כדי שהתראה תופיע גם אם הטאב נסגר (Chrome).

import { state, getMeta, setMeta } from "./state.js";
import { formatDateDisplay } from "./constants.js";

const CHECK_INTERVAL_MS = 60 * 1000;
// חלון התראה: משימה עם dueTime — כשמגיע הזמן (עד 15 דק' אחרי). משימה עם תאריך בלבד —
// מ-08:00 באותו יום, וגם תזכורת מקדימה יום לפני מ-18:00.
const LEAD_MIN_BEFORE_DATED = 0;

let swReg = null;
let notifiedIds = new Set();
let timer = null;

export async function initNotifications(registration) {
  swReg = registration || null;
  const saved = await getMeta("notifiedIds", []);
  notifiedIds = new Set(saved);
  refreshNoticeBar();
  startLoop();
}

export function startLoop() {
  stopLoop();
  checkDueItems();
  timer = setInterval(checkDueItems, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkDueItems();
  });
}
export function stopLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function refreshNoticeBar() {
  const bar = document.getElementById("notifNotice");
  if (!bar) return;
  const supported = "Notification" in window;
  bar.hidden = !supported || Notification.permission === "granted" || Notification.permission === "denied";
}

export async function requestPermission() {
  if (!("Notification" in window)) return "unsupported";
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  await setMeta("notifPermissionAsked", true);
  refreshNoticeBar();
  if (perm === "granted") {
    fire("Family OS", { body: "התראות מופעלות. נזכיר לך על משימות עם תאריך יעד קרוב." });
    checkDueItems();
  }
  return perm;
}

function due(task) {
  // מחזיר {when: Date, key} לרגע שבו צריך להתריע, או null.
  if (!task.dueDate && !task.dueTime) return null;
  const now = new Date();
  if (task.dueDate) {
    const [y, m, d] = task.dueDate.split("-").map(Number);
    if (task.dueTime) {
      const [hh, mm] = task.dueTime.split(":").map(Number);
      // חלון קצר: תזכורת בזמן, ועד 3 שעות אחרי
      return { when: new Date(y, m - 1, d, hh, mm), key: `${task.id}@due`, windowMs: 3 * 3600 * 1000 };
    }
    // תאריך בלבד: תזכורת ביום עצמו ב-08:00 (עד סוף היום), ותזכורת מקדימה יום לפני ב-18:00
    const dayOf = new Date(y, m - 1, d, 8, 0);
    const dayBefore = new Date(y, m - 1, d - 1, 18, 0);
    if (now >= dayOf) return { when: dayOf, key: `${task.id}@dayof`, windowMs: 36 * 3600 * 1000 };
    if (now >= dayBefore) return { when: dayBefore, key: `${task.id}@lead`, windowMs: 20 * 3600 * 1000 };
    return { when: dayBefore, key: `${task.id}@lead`, future: true };
  }
  // שעה בלבד (בלי תאריך) — לא מתריעים אוטומטית, אין יום ברור
  return null;
}

export async function checkDueItems() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = Date.now();
  let changed = false;

  for (const t of state.tasks) {
    if (t.status === "done") continue;
    const info = due(t);
    if (!info || info.future) continue;
    const overdueMs = now - info.when.getTime();
    // מתריעים אם עברנו את הזמן אבל עדיין בתוך חלון ההתראה (כדי לא להציף בהיסטוריה)
    if (overdueMs < 0 || overdueMs > (info.windowMs || 12 * 3600 * 1000)) continue;
    if (notifiedIds.has(info.key)) continue;

    const dateLbl = [formatDateDisplay(t.dueDate), t.dueTime].filter(Boolean).join(" · ");
    fire(`תזכורת: ${t.name}`, {
      body: `${t.owner} · ${t.category}${dateLbl ? ` · ${dateLbl}` : ""}`,
      tag: info.key,
      data: { taskId: t.id },
    });
    notifiedIds.add(info.key);
    changed = true;
  }

  // ניקוי מפתחות של משימות שכבר לא קיימות
  const liveKeys = new Set();
  state.tasks.forEach((t) => ["due", "dayof", "lead"].forEach((s) => liveKeys.add(`${t.id}@${s}`)));
  for (const k of [...notifiedIds]) if (!liveKeys.has(k)) { notifiedIds.delete(k); changed = true; }

  if (changed) await setMeta("notifiedIds", [...notifiedIds]);
}

function fire(title, opts) {
  const options = { icon: "icons/icon-192.png", badge: "icons/icon-192.png", ...opts };
  try {
    if (swReg && swReg.showNotification) swReg.showNotification(title, options);
    else new Notification(title, options);
  } catch (e) {
    try { new Notification(title, options); } catch (_) {}
  }
}

// לבדיקה ידנית מה-console: window.__familyosNotifyTest()
window.__familyosNotifyTest = () =>
  fire("בדיקת התראה — Family OS", { body: "אם אתה רואה את זה, ההתראות עובדות." });
