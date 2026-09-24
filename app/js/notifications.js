// Family OS — התראות פנימיות (סבב 1, ראו Family_OS_Notifications_Brief.md).
// toast בתוך הדף בלבד — לא הרשאת דפדפן, לא באנר מערכת הפעלה. פעיל רק כשהאפליקציה פתוחה.
// שלושה טריגרים: בלוק שבועי מתקרב (15 דק' לפני), משימה עם יעד מתקרב (שעה לפני / בוקר יום
// היעד אם אין שעה), פריט קניות שנוסף ע"י מכשיר אחר. סבב 2 (Push אמיתי דרך FCM) נפרד ובא אח"כ.

import { state, getMeta, setMeta } from "./state.js";
import { deviceLabel } from "./cloud.js";
import { formatDateDisplay, todayStr } from "./constants.js";

const CHECK_INTERVAL_MS = 60 * 1000;
const BLOCK_LEAD_MIN = 15;
const TASK_LEAD_MIN = 60;

let firedKeys = new Set();
let seenShoppingIds = null; // null = טרם אותחל (בעליה ראשונה לא מתריעים על מה שכבר קיים)
let onToast = () => {};
let timer = null;
// checkAll() נקרא גם מ-onStateChange בכל עדכון Firestore — כולל לפני שה-meta המקומי
// (firedKeys/seenShoppingIds) נטען בפועל מ-IndexedDB (שני האזנות אסינכרוניות עצמאיות,
// בלי ערובה לסדר). בלי השומר הזה, בדיקה שרצה לפני שה-meta נטען הייתה "רואה" את כל
// הפריטים הקיימים כחדשים ומתריעה עליהם בטעות בכל טעינה מחדש.
let ready = false;

export function setToastHandler(fn) { onToast = fn; }

export async function initNotifications() {
  firedKeys = new Set(await getMeta("notifFiredKeys", []));
  const savedSeen = await getMeta("notifShoppingSeenIds", null);
  seenShoppingIds = savedSeen ? new Set(savedSeen) : null;
  ready = true;
  startLoop();
}

export function startLoop() {
  stopLoop();
  checkAll();
  timer = setInterval(checkAll, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkAll(); });
}
export function stopLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function fireOnce(key, title, body) {
  if (firedKeys.has(key)) return;
  firedKeys.add(key);
  onToast(title, body);
}

function checkWeeklyBlocks() {
  const now = new Date();
  const today = todayStr(now);
  state.weeklyBlocks
    .filter((b) => b.dayOfWeek === now.getDay() && b.startTime)
    .forEach((b) => {
      const [hh, mm] = b.startTime.split(":").map(Number);
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
      const lead = new Date(start.getTime() - BLOCK_LEAD_MIN * 60000);
      if (now >= lead && now <= start) {
        fireOnce(`block@${b.id}@${today}`, `בעוד ${BLOCK_LEAD_MIN} דק': ${b.title}`, `${b.leader}${b.category ? " · " + b.category : ""}`);
      }
    });
}

function checkTasks() {
  const now = new Date();
  const today = todayStr(now);
  state.tasks.forEach((t) => {
    if (t.status === "done" || !t.dueDate) return;
    if (t.dueTime) {
      const [y, m, d] = t.dueDate.split("-").map(Number);
      const [hh, mm] = t.dueTime.split(":").map(Number);
      const due = new Date(y, m - 1, d, hh, mm);
      const lead = new Date(due.getTime() - TASK_LEAD_MIN * 60000);
      if (now >= lead && now <= due) {
        fireOnce(`task@${t.id}@${t.dueDate}@${t.dueTime}`, `בעוד שעה: ${t.name}`, `${t.owner} · ${formatDateDisplay(t.dueDate)} ${t.dueTime}`);
      }
    } else if (t.dueDate === today) {
      const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0);
      if (now >= morning) {
        fireOnce(`task@${t.id}@${t.dueDate}@morning`, `היום: ${t.name}`, `${t.owner} · ${t.category}`);
      }
    }
  });
}

function checkShopping() {
  if (seenShoppingIds === null) {
    // בעליה ראשונה: "רואים" את מה שכבר קיים בלי להתריע עליו רטרואקטיבית.
    seenShoppingIds = new Set(state.shopping.map((s) => s.id));
    return;
  }
  const me = deviceLabel();
  state.shopping.forEach((s) => {
    if (seenShoppingIds.has(s.id)) return;
    seenShoppingIds.add(s.id);
    if (s.addedBy && s.addedBy !== me) {
      onToast("נוסף פריט לקניות", `${s.name}${s.storeType ? " · " + s.storeType : ""}`);
    }
  });
}

// שרשור לכתיבות meta כדי שלא ידרסו זו את זו: checkAll יכול לרוץ כמה פעמים ברצף מהיר
// (כל שינוי state), וכתיבת IndexedDB אסינכרונית בלי שרשור עלולה להסתיים מחוץ לסדר,
// והכי-אחרונה-שהתחילה (עם סט קטן/ישן יותר) יכולה לדרוס כתיבה מאוחרת יותר בפועל.
let persistTail = Promise.resolve();
function persist(key, value) {
  persistTail = persistTail.then(() => setMeta(key, value)).catch(() => {});
}

export function checkAll() {
  if (!ready) return;
  const before = firedKeys.size;
  checkWeeklyBlocks();
  checkTasks();
  checkShopping();
  if (firedKeys.size !== before) persist("notifFiredKeys", [...firedKeys]);
  if (seenShoppingIds) persist("notifShoppingSeenIds", [...seenShoppingIds]);
}

// לבדיקה ידנית מה-console: window.__familyosNotifyTest()
window.__familyosNotifyTest = () => onToast("בדיקת התראה — Family OS", "אם אתה רואה את זה, ההתראות עובדות.");
