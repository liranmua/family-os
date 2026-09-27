// Family OS — ניווט בין מסכים (Hub + אזורים). שכבת DOM נקייה, בלי תלות ב-state.

const SCREENS = ["hub", "tasks", "routines", "shopping", "finance", "projects", "project-detail", "calendar", "settings"];

// נקרא כשעוברים למסך אחר (לא כשנשארים באותו אחד) — למשל לאפס מצב UI זמני
// שלא אמור "להיזכר" בין ביקורים (accordion קטגוריות בקניות).
let _onEnter = () => {};
export function setScreenEnterHandler(fn) { _onEnter = fn; }

export function showScreen(name) {
  if (!SCREENS.includes(name)) name = "hub";
  const prev = currentScreen();
  SCREENS.forEach((s) => {
    const el = document.getElementById("screen-" + s);
    if (el) el.hidden = s !== name;
  });
  document.querySelectorAll(".sidebar-link").forEach((b) => b.classList.toggle("active", b.dataset.go === name));
  window.scrollTo(0, 0);
  if (prev !== name) _onEnter(name);
}

export function currentScreen() {
  return SCREENS.find((s) => {
    const el = document.getElementById("screen-" + s);
    return el && !el.hidden;
  }) || "hub";
}
