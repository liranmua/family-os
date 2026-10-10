// Family OS — סקריפט מתוזמן (GitHub Actions, ראו .github/workflows/push-check.yml)
// ששולח Push אמיתי דרך FCM. מריץ בדיוק את שלוש לוגיקות-הבדיקה שכבר קיימות ב-
// app/js/notifications.js (סבב 1: בלוק שבועי מתקרב, משימה עם יעד מתקרב, פריט
// קניות חדש) — נגד Firestore ישירות עם firebase-admin, במקום toast בתוך הדף.
//
// "פעם ראשונה שזה רץ בפועל" תלויה בשמירת FIREBASE_SERVICE_ACCOUNT_KEY כ-GitHub
// Secret ע"י לירן (Family_OS_Notifications_Brief.md, מסלול א') — הסקריפט עצמו
// לא יודע/רואה את הערך בשום שלב מלבד קריאה מ-env בזמן ריצה ב-CI.

import admin from "firebase-admin";

// כל השעות ב-Firestore (בלוקים/משימות) הן שעון ישראל; runner של GitHub Actions רץ ב-UTC.
// חייב להיקבע לפני כל שימוש ב-Date (גם ה-workflow מגדיר TZ — כאן כגיבוי).
process.env.TZ = "Asia/Jerusalem";

// אותו מיפוי מייל->שם כמו app/js/constants.js (EMAIL_TO_NAME) — לצורך התאמה אישית של ההתראה היומית.
const EMAIL_TO_NAME = { "liranmua@gmail.com": "לירן" };
const PEOPLE = ["לירן", "מורן"];

// התראה יומית בבוקר (סבב 3): טריגר רביעי, פעם אחת ביום (firedKeys).
// GitHub Actions מפעיל את ה-cron המתוזמן רק ~4-6 פעמים ביממה (לא כל 5 דקות — נמדד אמפירית, אוקטובר 2026),
// כך שחלון צר של 07:30–09:00 כמעט אף פעם לא נפגע. לכן: ההרצה הראשונה אחרי 07:30 שולחת ("catch-up"),
// ועד DAILY_END_MIN (כולל). היום מסומן כנשלח רק אחרי משלוח מוצלח בפועל (לפחות מכשיר אחד).
const DAILY_START_MIN = 7 * 60 + 30;
const DAILY_END_MIN = 13 * 60;

// יומן משלוחים אחרונים (נשמר ב-pushState) — כדי שאפשר יהיה לאמת מ-Firestore שהודעה באמת נשלחה ולכמה מכשירים.
const sendLog = [];

// אותו נתיב משפחתי קבוע כמו app/js/firebase.js — מזהה ניתוב, לא סוד.
const FAMILY_ID = "fam_fd8a2e611ce12ff0e8bce649";
const BLOCK_LEAD_MIN = 15;
const TASK_LEAD_MIN = 60;

const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyJson) {
  console.error(
    "FIREBASE_SERVICE_ACCOUNT_KEY חסר — לא ניתן להתחבר ל-Firestore. " +
      "ראו Family_OS_Notifications_Brief.md, מסלול א' (שמירת המפתח כ-GitHub Secret)."
  );
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(keyJson)) });
const db = admin.firestore();
const famRef = db.collection("families").doc(FAMILY_ID);

// משכפל את הלוגיקה מ-app/js/constants.js (סקריפט נפרד, לא מייבא מ-app/): "ממתין" שקט עד תאריך הבדיקה,
// ומשימה עם "תוקף עד" שמתקרב (≤14 יום או שפג) נחשבת דחופה בתקציר היומי.
const VALIDITY_URGENT_DAYS = 14;
function daysUntil(iso, fromIso) {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
const isSnoozed = (t, today) => t.status === "waiting" && !!t.nextCheckDate && t.nextCheckDate > today;
const isValidityUrgent = (t, today) => !!t.validUntil && daysUntil(t.validUntil, today) <= VALIDITY_URGENT_DAYS;
const isCheckDue = (t, today) => t.status === "waiting" && !!t.nextCheckDate && t.nextCheckDate <= today;
const isUrgent = (t, today) =>
  t.status !== "done" && !isSnoozed(t, today) &&
  ((!!t.dueDate && t.dueDate <= today) || t.priority === "דחוף" || isValidityUrgent(t, today) || isCheckDue(t, today));

function todayStr(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function loadCollection(name) {
  const snap = await famRef.collection(name).get();
  return snap.docs.filter((d) => d.id !== "_placeholder").map((d) => ({ ...d.data(), id: d.id }));
}

async function sendToAll(tokenDocs, title, body) {
  if (!tokenDocs.length) return 0;
  const message = { data: { title, body }, tokens: tokenDocs.map((t) => t.id) };
  try {
    const resp = await admin.messaging().sendEachForMulticast(message);
    console.log(`נשלח "${title}" ל-${resp.successCount}/${tokenDocs.length} מכשירים.`);
    sendLog.push({ at: new Date().toISOString(), title, ok: resp.successCount, of: tokenDocs.length, errors: resp.responses.filter((r) => !r.success).map((r) => r.error?.code || "unknown") });
    const invalidCodes = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];
    const invalidIds = [];
    resp.responses.forEach((r, i) => {
      if (!r.success && invalidCodes.includes(r.error?.code)) invalidIds.push(tokenDocs[i].id);
    });
    if (invalidIds.length) {
      await Promise.all(invalidIds.map((id) => famRef.collection("pushTokens").doc(id).delete()));
      console.log(`הוסרו ${invalidIds.length} טוקנים לא-תקפים.`);
    }
    return resp.successCount;
  } catch (e) {
    console.error(`שליחת "${title}" נכשלה:`, e.message || e);
    sendLog.push({ at: new Date().toISOString(), title, ok: 0, of: tokenDocs.length, errors: [String(e.code || e.message || e)] });
    return 0;
  }
}

function summarize(items, max = 4) {
  const shown = items.slice(0, max).map((i) => i.text).join(" · ");
  return items.length > max ? `${shown} · +${items.length - max} נוספים` : shown;
}

// התאמה אישית לפי מכשיר: טוקן שהמייל שלו מזוהה בשם -> "שלך" / "אצל <השני>" (כמו "שלך היום"/"גם היום אצל מורן");
// טוקן לא מזוהה (למשל מורן, עדיין לא מחוברת בשם) -> רשימה אחת רגילה.
async function sendDaily(tokenDocs, items) {
  let ok = 0;
  const named = new Map(); // name -> tokenDocs
  const generic = [];
  for (const t of tokenDocs) {
    const name = EMAIL_TO_NAME[t.email];
    if (name) { if (!named.has(name)) named.set(name, []); named.get(name).push(t); }
    else generic.push(t);
  }
  for (const [me, docs] of named) {
    const other = PEOPLE.find((p) => p !== me);
    const mine = items.filter((i) => i.owner === me);
    const theirs = items.filter((i) => i.owner === other);
    const parts = [];
    if (mine.length) parts.push(`שלך: ${summarize(mine)}`);
    if (theirs.length) parts.push(`אצל ${other}: ${summarize(theirs, 2)}`);
    if (!parts.length) continue;
    ok += await sendToAll(docs, "☀️ הבוקר שלך", parts.join("\n"));
  }
  if (generic.length) ok += await sendToAll(generic, "☀️ היום", summarize(items, 5));
  return ok;
}

async function main() {
  const [weeklyBlocks, tasks, shopping, tokenDocs, stateSnap] = await Promise.all([
    loadCollection("weeklyBlocks"),
    loadCollection("tasks"),
    loadCollection("shopping"),
    loadCollection("pushTokens"),
    famRef.collection("meta").doc("pushState").get(),
  ]);

  const prev = stateSnap.exists ? stateSnap.data() : {};
  const firedKeys = new Set(prev.firedKeys || []);
  const firstRun = !prev.shoppingSeenIds;
  const seenShoppingIds = new Set(prev.shoppingSeenIds || []);

  const now = new Date();
  const today = todayStr(now);
  const notifications = []; // { key, title, body }
  const shoppingNotifications = []; // { title, body, skipDeviceLabel }

  // 1) בלוק שבועי מתקרב (15 דק' לפני, כמו notifications.js:checkWeeklyBlocks)
  weeklyBlocks
    .filter((b) => b.dayOfWeek === now.getDay() && b.startTime)
    .forEach((b) => {
      const [hh, mm] = b.startTime.split(":").map(Number);
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
      const lead = new Date(start.getTime() - BLOCK_LEAD_MIN * 60000);
      if (now >= lead && now <= start) {
        const key = `block@${b.id}@${today}`;
        if (!firedKeys.has(key)) {
          firedKeys.add(key);
          notifications.push({ key, title: `בעוד ${BLOCK_LEAD_MIN} דק': ${b.title}`, body: `${b.leader}${b.category ? " · " + b.category : ""}` });
        }
      }
    });

  // 2) משימה עם יעד מתקרב (שעה לפני / בוקר יום היעד, כמו notifications.js:checkTasks)
  tasks.forEach((t) => {
    if (t.status === "done" || isSnoozed(t, today) || !t.dueDate) return;
    if (t.dueTime) {
      const [y, m, d] = t.dueDate.split("-").map(Number);
      const [hh, mm] = t.dueTime.split(":").map(Number);
      const due = new Date(y, m - 1, d, hh, mm);
      const lead = new Date(due.getTime() - TASK_LEAD_MIN * 60000);
      if (now >= lead && now <= due) {
        const key = `task@${t.id}@${t.dueDate}@${t.dueTime}`;
        if (!firedKeys.has(key)) {
          firedKeys.add(key);
          notifications.push({ key, title: `בעוד שעה: ${t.name}`, body: `${t.owner || ""} · ${t.dueDate} ${t.dueTime}` });
        }
      }
    } else if (t.dueDate === today) {
      const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0);
      if (now >= morning) {
        const key = `task@${t.id}@${t.dueDate}@morning`;
        if (!firedKeys.has(key)) {
          firedKeys.add(key);
          notifications.push({ key, title: `היום: ${t.name}`, body: `${t.owner || ""} · ${t.category || ""}` });
        }
      }
    }
  });

  // 3) פריט קניות חדש ע"י מכשיר אחר (כמו notifications.js:checkShopping) — בעלייה
  // ראשונה "רואים" את מה שכבר קיים בלי להתריע רטרואקטיבית, כמו הלקוח.
  shopping.forEach((s) => {
    if (seenShoppingIds.has(s.id)) return;
    seenShoppingIds.add(s.id);
    if (!firstRun && s.addedBy) {
      shoppingNotifications.push({ title: "נוסף פריט לקניות", body: `${s.name}${s.storeType ? " · " + s.storeType : ""}`, skipDeviceLabel: s.addedBy });
    }
  });

  // 4) התראה יומית בבוקר — אותה לוגיקת מיזוג כמו מסך הבית (renderHub): בלוקים של היום + משימות
  // פתוחות עם יעד עד היום או עדיפות דחוף. אירועי Google Calendar לא כלולים (הטוקן שלהם נמצא רק בדפדפן
  // של המשתמש, לא נגיש מהסקריפט). שגרות לא כלולות — גם מסך הבית לא מציג אותן (אין להן תאריך).
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dailyKey = `daily@${today}`;
  let dailyItems = [];
  let dailyDue = nowMin >= DAILY_START_MIN && nowMin <= DAILY_END_MIN && !firedKeys.has(dailyKey);
  if (dailyDue) {
    const blocksToday = weeklyBlocks
      .filter((b) => b.dayOfWeek === now.getDay())
      .map((b) => ({ sort: b.startTime || "00:00", owner: b.leader, text: `${b.startTime ? b.startTime + " " : ""}${b.title}` }));
    const tasksToday = tasks
      .filter((t) => isUrgent(t, today))
      .map((t) => {
        const days = isValidityUrgent(t, today) ? daysUntil(t.validUntil, today) : null;
        const vNote = days === null ? "" : days < 0 ? " (התוקף פג)" : days === 0 ? " (תוקף עד היום)" : ` (תוקף עוד ${days} ימים)`;
        const checkDue = isCheckDue(t, today);
        const note = vNote + (checkDue ? " (זמן לבדוק מול הגורם)" : "");
        // תוקף שמתקרב / תאריך בדיקה שהגיע עולים בדירוג: באותה שעה, פחות ימים קודם.
        const ranks = [days, checkDue ? daysUntil(t.nextCheckDate, today) : null].filter((n) => n !== null);
        return { sort: t.dueTime || "00:00", rank: ranks.length ? Math.min(...ranks) : 9999, owner: t.owner, text: `${t.dueTime ? t.dueTime + " " : ""}${t.name}${note}` };
      });
    dailyItems = [...blocksToday, ...tasksToday].sort((a, b) => a.sort.localeCompare(b.sort) || (a.rank ?? 9999) - (b.rank ?? 9999));
    if (!dailyItems.length) { firedKeys.add(dailyKey); dailyDue = false; } // אין מה להציג היום — לא שולחים ולא מנסים שוב
  }

  const totalNew = notifications.length + shoppingNotifications.length + (dailyDue ? 1 : 0);
  if (!totalNew) {
    console.log("אין התראות חדשות לשליחה.");
  } else if (!tokenDocs.length) {
    console.log(`${totalNew} התראות ממתינות, אבל אין עדיין אף מכשיר רשום ל-Push (ר' הגדרות → התראות Push).`);
  } else {
    if (dailyDue) {
      const ok = await sendDaily(tokenDocs, dailyItems);
      if (ok > 0) firedKeys.add(dailyKey); // רק משלוח מוצלח סוגר את היום; כישלון -> ניסיון חוזר בהרצה הבאה
    }
    for (const n of notifications) await sendToAll(tokenDocs, n.title, n.body);
    // מדלגים על הטוקן של אותו מכשיר שהוסיף את הפריט — כמו s.addedBy !== me אצל הלקוח.
    for (const n of shoppingNotifications) {
      await sendToAll(tokenDocs.filter((t) => t.deviceLabel !== n.skipDeviceLabel), n.title, n.body);
    }
  }

  await famRef.collection("meta").doc("pushState").set({
    firedKeys: [...firedKeys],
    shoppingSeenIds: [...seenShoppingIds],
    lastSends: [...sendLog, ...(prev.lastSends || [])].slice(0, 10),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

main().catch((e) => {
  console.error("push script failed:", e);
  process.exit(1);
});
