// Family OS — אתחול Firebase (Firestore + Auth).
//
// שלב 3: מוסיפים Google Sign-In. בצעד הראשון ה-Sign-In הוא זיהוי בלבד וה-Security
// Rules עדיין פתוחות לנתיב המשפחתי הקבוע (עובד במקביל). ההידוק לרשימת מיילים סגורה
// קורה רק אחרי ששני הצדדים התחברו לפחות פעם אחת. firebaseConfig הוא מזהה ציבורי
// של אפליקציית קליינט — מותר שיהיה בקוד.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBV0Ix1RIXJN9xIlolT7pjflrCmZAvG6HI",
  authDomain: "family-os-poc.firebaseapp.com",
  projectId: "family-os-poc",
  storageBucket: "family-os-poc.firebasestorage.app",
  messagingSenderId: "670882998874",
  appId: "1:670882998874:web:9d25c8bc70349dc92a8663",
};

// נתיב משפחתי קבוע. שני המכשירים (לירן + מורן) משתמשים באותו הערך.
// אפשר לעקוף עם ?fam=... לבדיקות בלבד (לא בשימוש רגיל) — כדי לא לגעת בנתיב האמיתי.
const DEFAULT_FAMILY_ID = "fam_fd8a2e611ce12ff0e8bce649";
function resolveFamilyId() {
  try {
    const q = new URLSearchParams(location.search).get("fam");
    if (q && q !== DEFAULT_FAMILY_ID && /^test_[a-zA-Z0-9_-]{1,50}$/.test(q)) {
      console.warn("Family OS: משתמש בנתיב בדיקה", q, "(לא הנתונים האמיתיים)");
      return q;
    }
  } catch (_) {}
  return DEFAULT_FAMILY_ID;
}
export const FAMILY_ID = resolveFamilyId();

export const app = initializeApp(firebaseConfig);

// offline persistence מובנה של Firestore — מחליף את שכבת ה-IndexedDB הידנית של שלב 1.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const familyRoot = doc(db, "families", FAMILY_ID);

// עזרי נתיב: תת-אוסף / מסמך תחת המשפחה.
export function familyCol(name) {
  return collection(familyRoot, name);
}
export function familyDoc(colName, id) {
  return doc(familyRoot, colName, String(id));
}
