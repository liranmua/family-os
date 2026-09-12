// Family OS — ניווט בין מסכים (Hub + אזורים). שכבת DOM נקייה, בלי תלות ב-state.

const SCREENS = ["hub", "tasks", "routines", "shopping", "finance", "projects", "project-detail", "calendar", "settings"];

export function showScreen(name) {
  if (!SCREENS.includes(name)) name = "hub";
  SCREENS.forEach((s) => {
    const el = document.getElementById("screen-" + s);
    if (el) el.hidden = s !== name;
  });
  window.scrollTo(0, 0);
}

export function currentScreen() {
  return SCREENS.find((s) => {
    const el = document.getElementById("screen-" + s);
    return el && !el.hidden;
  }) || "hub";
}
