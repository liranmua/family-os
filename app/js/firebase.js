// Family OS — אתחול Firebase + Firestore (שלב 2).
//
// מודל גישה: אין authentication (זה שלב 3). שני המכשירים מצביעים על נתיב משפחתי
// קבוע ומוטבע בקוד. firebaseConfig הוא מזהה ציבורי של אפליקציית קליינט — מותר
// שיהיה בקוד. ה-FAMILY_ID אקראי כדי להוסיף עמימות, אבל הוא לא סוד אמיתי:
// Security Rules ב-Firestore מגבילות גישה לנתיב הזה בלבד, לא ברמת משתמש.

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
export const FAMILY_ID = "fam_fd8a2e611ce12ff0e8bce649";

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
