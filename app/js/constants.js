// Family OS — קבועים ומפות תצוגה + כלי עזר קטנים.
// מבוסס family_hub_dashboard.html (הסקיצה המאושרת). נערוך לפי צורך אמיתי, לא לנעול מראש.

export const CATEGORY_COLOR = {
  "פיננסים וניהול עתידי": "var(--accent-fin)",
  "ילדים": "var(--accent-kids)",
  "קניות וציוד": "var(--accent-shop)",
  "תחזוקת הבית": "var(--accent-home)",
  "פרויקטים וחלומות": "var(--accent-proj)",
  "לוח שנה ואירועים": "var(--accent-cal)",
};
export const CATEGORY_LIST = Object.keys(CATEGORY_COLOR);

// People: לירן / מורן קבועים ואפשריים כאחראים. דור / שי — "נוגע ל" בלבד.
export const PEOPLE = [
  { name: "לירן", role: "הורה", assignable: true },
  { name: "מורן", role: "הורה", assignable: true },
  { name: "דור", role: "ילד/ה", assignable: false },
  { name: "שי", role: "ילד/ה", assignable: false },
];
export const ASSIGNABLE_NAMES = PEOPLE.filter((p) => p.assignable).map((p) => p.name);
export const ALL_PEOPLE_NAMES = PEOPLE.map((p) => p.name);

export const STATUS_LABEL = { todo: "טרם התחיל", progress: "בביצוע", waiting: "ממתין", done: "הושלם" };
export const STATUS_CLASS = { todo: "status-todo", progress: "status-progress", waiting: "status-waiting", done: "status-done" };
export const STATUS_ORDER = ["todo", "progress", "waiting", "done"];

export const TYPE_META = {
  "חד-פעמית": { icon: "📌", cls: "type-once" },
  "תהליכית": { icon: "🧩", cls: "type-process" },
};

export const PRIORITY_OPTIONS = ["דחוף", "רגיל", "נמוך"];
export const FREQUENCY_OPTIONS = ["חד-פעמי", "שבועי", "חודשי"];
export const SHOP_STATUS_OPTIONS = ["חסר", "בעגלה", "במלאי"];
export const SHOP_CATEGORY_OPTIONS = ["אוכל", "טואלטיקה", "ניקיון", "ציוד ילדים", "אחר"];

// ---- כלי עזר ----

export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDateDisplay(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y.slice(2)}`;
}

export function optionList(values, selected) {
  return values
    .map((v) => `<option value="${escAttr(v)}" ${v === selected ? "selected" : ""}>${v}</option>`)
    .join("");
}

export function nextId(prefix, ids, width = 3) {
  let max = 0;
  const re = new RegExp("^" + prefix + "-(\\d+)$");
  ids.forEach((id) => {
    const m = re.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

// בריחת תווים ל-HTML (הדשבורד לא עשה את זה — כאן כן, כי הנתונים נשמרים ונטענים מחדש)
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
export function escAttr(s) {
  return esc(s);
}
