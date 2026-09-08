// Family OS — שכבת הנתונים מול Firestore (שלב 2).
// מחליפה את הכתיבה/קריאה הידנית ל-IndexedDB. ה-offline persistence המובנה של
// ה-SDK (מוגדר ב-firebase.js) נותן את הקאש המקומי + תור כתיבות אופליין.

import { db, familyCol, familyDoc } from "./firebase.js";
import {
  doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, runTransaction,
  writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// אוספים "רגילים" שמסתנכרנים. finance יושב ב-meta ומטופל בנפרד.
export const COLLECTIONS = ["tasks", "routines", "routineCompletions", "projects", "shopping", "updatesLog"];

const INIT_DOC = () => familyDoc("_meta", "init");

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) out[k] = v.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? stripUndefined(x) : x));
    else if (v && typeof v === "object" && !(v instanceof Date)) out[k] = stripUndefined(v);
    else out[k] = v;
  }
  return out;
}

export function deviceLabel() {
  let d;
  try { d = localStorage.getItem("familyos.device"); } catch (_) {}
  if (!d) {
    d = "מכשיר-" + Math.random().toString(36).slice(2, 6);
    try { localStorage.setItem("familyos.device", d); } catch (_) {}
  }
  return d;
}

// ---- מיגרציה חד-פעמית, עם לוגיקת בטיחות ----
// local: { tasks:[], routines:[], routineCompletions:[], projects:[], shopping:[], updatesLog:[], finance:{} }
// מחזיר: { migrated:bool, reason:string }
export async function runMigration(local) {
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(INIT_DOC());
      if (snap.exists() && snap.data().done) {
        return { migrated: false, reason: "already-initialized" };
      }
      // הנתיב המשותף עדיין ריק — המכשיר הזה הוא הראשון. מעלים את הנתונים המקומיים.
      const counts = {};
      for (const name of COLLECTIONS) {
        const rows = local[name] || [];
        counts[name] = rows.length;
        for (const row of rows) {
          const id = String(row.id);
          tx.set(doc(familyCol(name), id), stripUndefined({ ...row, id }));
        }
      }
      if (local.finance) tx.set(familyDoc("meta", "finance"), { value: stripUndefined(local.finance) });
      tx.set(INIT_DOC(), { done: true, at: serverTimestamp(), by: deviceLabel(), counts });
      return { migrated: true, reason: "uploaded-local", counts };
    });
  } catch (e) {
    // אם המיגרציה נכשלה (למשל שני מכשירים בו-זמנית) — לא נורא, פשוט נאזין לקיים.
    return { migrated: false, reason: "tx-failed: " + (e && e.code ? e.code : e) };
  }
}

export async function isInitialized() {
  try {
    const s = await getDoc(INIT_DOC());
    return s.exists() && !!s.data().done;
  } catch (_) {
    return false;
  }
}

// ---- listeners (זמן אמת, בלי polling) ----

export function listenCollection(name, cb, onMeta) {
  return onSnapshot(
    familyCol(name),
    { includeMetadataChanges: true },
    (snap) => {
      const rows = snap.docs
        .filter((d) => d.id !== "_placeholder")
        .map((d) => ({ ...d.data(), id: d.id }));
      cb(rows);
      if (onMeta) onMeta({ fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
    },
    (err) => console.warn(`listen ${name} error:`, err)
  );
}

export function listenMeta(key, cb) {
  return onSnapshot(familyDoc("meta", key), (snap) => {
    cb(snap.exists() ? snap.data().value : null);
  });
}

// ---- כתיבות ----

export async function writeDoc(name, obj) {
  const id = String(obj.id);
  await setDoc(doc(familyCol(name), id), stripUndefined({ ...obj, id }));
}

export async function removeDoc(name, id) {
  await deleteDoc(doc(familyCol(name), String(id)));
}

export async function writeMeta(key, value) {
  await setDoc(familyDoc("meta", key), { value: stripUndefined(value) });
}

// מחיקת כל תוכן אוסף (ל"אפס הכל")
export async function clearCollection(name) {
  const snap = await getDocs(familyCol(name));
  const chunks = [];
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    if (++n === 400) { chunks.push(batch.commit()); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) chunks.push(batch.commit());
  await Promise.all(chunks);
}

export async function bulkWrite(name, rows) {
  const chunks = [];
  let batch = writeBatch(db);
  let n = 0;
  for (const row of rows) {
    const id = String(row.id);
    batch.set(doc(familyCol(name), id), stripUndefined({ ...row, id }));
    if (++n === 400) { chunks.push(batch.commit()); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) chunks.push(batch.commit());
  await Promise.all(chunks);
}
