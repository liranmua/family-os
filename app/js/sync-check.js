// Family OS — בדיקת חיבור Firestore (שלב 2, צעד ראשון).
//
// זמני: מוכיח כתיבה+קריאה של רשומה אחת שנראית בשני מכשירים, לפני שנוגעים
// בשכבת הנתונים הקיימת. יוסר כשהסנכרון האמיתי (ישות-ישות) ייכנס.

import { familyDoc } from "./firebase.js";
import {
  setDoc, onSnapshot, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const PING = () => familyDoc("_healthcheck", "ping");

function deviceLabel() {
  let d;
  try { d = localStorage.getItem("familyos.device"); } catch (_) {}
  if (!d) {
    d = "מכשיר-" + Math.random().toString(36).slice(2, 6);
    try { localStorage.setItem("familyos.device", d); } catch (_) {}
  }
  return d;
}

function fmtTime(ts) {
  try {
    const dt = ts && ts.toDate ? ts.toDate() : null;
    if (!dt) return "—";
    return dt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (_) { return "—"; }
}

export function initSyncCheck() {
  const statusEl = document.getElementById("syncStatus");
  const lastEl = document.getElementById("syncLast");
  const btn = document.getElementById("syncPingBtn");
  if (!statusEl) return;

  const me = deviceLabel();
  statusEl.textContent = "Firestore: מתחבר…";

  // onSnapshot נותן גם עדכוני זמן-אמת וגם מצב מטמון/רשת — בלי polling.
  onSnapshot(
    PING(),
    { includeMetadataChanges: true },
    (snap) => {
      const fromCache = snap.metadata.fromCache;
      statusEl.textContent = fromCache
        ? "Firestore: מקומי (אין רשת כרגע) · הנתונים יסתנכרנו כשתחזור"
        : "Firestore: מחובר ✓ (me-west1)";
      if (snap.exists()) {
        const d = snap.data();
        lastEl.textContent = `בדיקה אחרונה: ${fmtTime(d.at)} · מ${d.from || "?"} · #${d.n || 0}`;
        lastEl.hidden = false;
      } else {
        lastEl.textContent = "עדיין אין רשומת בדיקה — לחצו על הכפתור";
        lastEl.hidden = false;
      }
    },
    (err) => {
      statusEl.textContent = "Firestore: שגיאת חיבור — " + (err && err.code ? err.code : err);
    }
  );

  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = "כותב…";
      try {
        await setDoc(PING(), { at: serverTimestamp(), from: me, n: increment(1) }, { merge: true });
        btn.textContent = "נכתב ✓";
      } catch (e) {
        btn.textContent = "נכשל";
        document.getElementById("syncStatus").textContent =
          "Firestore: כתיבה נכשלה — " + (e && e.code ? e.code : e);
      } finally {
        setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 1500);
      }
    });
  }
}
