// Family OS — רישום מכשיר ל-FCM Push (סבב 2, Family_OS_Notifications_Brief.md,
// מסלול ב'). דורש משתמש מחובר (Google Sign-In קיים) ואישור הרשאת התראות בדפדפן.
// שומר את הטוקן תחת אותו נתיב משפחתי (families/{FAMILY_ID}/pushTokens/{token}),
// יחד עם deviceLabel — כדי שהסקריפט המתוזמן (scripts/send-push.mjs) יוכל לדלג על
// אותו מכשיר שהוסיף פריט קניות, בדיוק כמו s.addedBy !== me אצל notifications.js.

import { app, familyCol } from "./firebase.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { deviceLabel } from "./cloud.js";
import { currentUser } from "./auth.js";
import { getMeta, setMeta } from "./state.js";

// מפתח VAPID — לא סוד (ציבורי, כמו firebaseConfig ב-firebase.js), מ-Firebase
// Console → Project settings → Cloud Messaging → Web configuration → Generate
// key pair (ר' הבריף, מסלול א', צעד 3).
const VAPID_KEY = "BOyJ_SfBIiJtwMpOXutn2iWUoarUmYixhsvBTcLnuK6S2-xQkZ94jLhjgext15FwfziRpkfSi1k2TlZyuda55ak";

let swReg = null;
let onChange = () => {};
let supported = false;
let granted = false;
let lastError = null;

export function isPushSupported() { return supported; }
export function isPushGranted() { return granted; }
export function getPushError() { return lastError; }

export async function initPush(registration, changeHandler) {
  onChange = changeHandler || (() => {});
  swReg = registration;
  try {
    supported = !!swReg && "Notification" in window && (await isSupported());
  } catch (_) {
    supported = false;
  }
  granted = supported && Notification.permission === "granted" && !!(await getMeta("pushTokenSaved", false));
  onChange();
}

export async function enablePush() {
  lastError = null;
  if (!supported) { lastError = "הדפדפן הזה לא תומך בהתראות Push."; onChange(); return; }
  if (!VAPID_KEY) { lastError = "עדיין לא הוגדר מפתח VAPID (שלב חד-פעמי של לירן, ר' הבריף)."; onChange(); return; }
  const user = currentUser();
  if (!user) { lastError = "צריך להתחבר עם Google קודם."; onChange(); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { lastError = "הרשאת התראות לא אושרה בדפדפן."; onChange(); return; }
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (!token) { lastError = "לא התקבל טוקן ממכשיר זה — נסו שוב."; onChange(); return; }
    await setDoc(doc(familyCol("pushTokens"), token), {
      email: user.email || null,
      name: user.displayName || null,
      deviceLabel: deviceLabel(),
      updatedAt: Date.now(),
    });
    await setMeta("pushTokenSaved", true);
    granted = true;
  } catch (e) {
    lastError = "רישום ל-Push נכשל: " + (e && e.message ? e.message : String(e));
  }
  onChange();
}
