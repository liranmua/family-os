// Family OS — Google Sign-In (שלב 3, צעד 1: זיהוי בלבד).
//
// בצעד הזה ההתחברות לא חוסמת כלום — הנתונים עדיין נטענים דרך הנתיב המשפחתי הקבוע.
// המטרה: ששני הצדדים יתחברו לפחות פעם אחת, ורק אז נהדק את ה-Security Rules.

import { app } from "./firebase.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

let _currentUser = null;
export function currentUser() { return _currentUser; }

// שם להצגה / לרישום ב-"בוצע ע"י" — המשתמש המחובר, או fallback.
export function currentUserName(fallback) {
  if (_currentUser) return _currentUser.displayName || _currentUser.email || fallback;
  return fallback;
}

export async function initAuth(onChange) {
  // אם חזרנו מ-redirect (מובייל) — נצרוך את התוצאה כדי לתפוס שגיאות
  try { await getRedirectResult(auth); } catch (e) { console.warn("redirect result:", e && e.code); }

  onAuthStateChanged(auth, (user) => {
    _currentUser = user
      ? { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL }
      : null;
    onChange(_currentUser);
  });
}

export async function signIn() {
  try {
    await signInWithPopup(auth, provider);
    return { ok: true };
  } catch (e) {
    const code = e && e.code ? e.code : String(e);
    // חלק מהדפדפנים/PWA חוסמים popup — ננסה redirect
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/cancelled-popup-request") {
      try { await signInWithRedirect(auth, provider); return { ok: true, redirect: true }; }
      catch (e2) { return { ok: false, code: e2 && e2.code ? e2.code : String(e2) }; }
    }
    if (code === "auth/popup-closed-by-user") return { ok: false, code, silent: true };
    return { ok: false, code };
  }
}

export async function signOutUser() {
  await signOut(auth);
}
