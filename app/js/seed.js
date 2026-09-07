// Family OS — נתוני זריעה ראשוניים (מתוך family_hub_dashboard.html).
// נטענים פעם אחת בהפעלה הראשונה, כדי שהאפליקציה לא תהיה ריקה. אפשר "לאפס הכל" בהגדרות.

import { todayStr } from "./constants.js";

export const SEED_VERSION = 1;

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function buildSeed() {
  return {
    projects: [
      { id: "PRJ-001", name: "חדר משחקים לילדים", category: "פרויקטים וחלומות", owner: "לירן", status: "todo", priority: "רגיל", target: null, budget: null, notes: null },
    ],
    tasks: [
      {
        id: "TSK-001", name: "תיקון נזילה במקלחת חדר הורים", category: "תחזוקת הבית", owner: "לירן", status: "todo",
        taskType: "תהליכית", dueDate: plusDays(3), dueTime: null, frequency: "חד-פעמי", priority: "רגיל",
        next: "להתקשר לאיש מקצוע לקבלת הצעת מחיר", relatedPerson: null, projectId: null,
        subtasks: [
          { id: "SUB-001", name: "לתאם ביקור של איש מקצוע", done: false, notes: "המקצוען הראשון שפנינו אליו לא ענה, ננסה שני" },
          { id: "SUB-002", name: "לקבל הצעת מחיר", done: false },
          { id: "SUB-003", name: "לאשר תאריך לתיקון בפועל", done: false },
        ],
      },
      {
        id: "TSK-002", name: "תכנון רשימת קניות שבועית לבית", category: "קניות וציוד", owner: "מורן", status: "progress",
        taskType: "חד-פעמית", dueDate: plusDays(1), dueTime: null, frequency: "שבועי", priority: "רגיל",
        next: "בדיקת חוסרים במזווה ובמקרר", relatedPerson: null, projectId: null, subtasks: [],
      },
      {
        id: "TSK-003", name: "תקציב חודשי והגדרת יעד פנוי", category: "פיננסים וניהול עתידי", owner: "לירן", status: "progress",
        taskType: "חד-פעמית", dueDate: plusDays(5), dueTime: null, frequency: "חודשי", priority: "רגיל",
        next: "הוצאת סיכום נתונים מתקציב", relatedPerson: null, projectId: null, subtasks: [],
      },
      {
        id: "TSK-004", name: "שיחת סנכרון משפחתית שבועית", category: "לוח שנה ואירועים", owner: "לירן", status: "todo",
        taskType: "חד-פעמית", dueDate: plusDays(2), dueTime: "20:00", frequency: "שבועי", priority: "רגיל",
        next: "פתיחת הקובץ ובדיקת משימות פתוחות", relatedPerson: null, projectId: null, subtasks: [],
      },
      {
        id: "TSK-005", name: "קלינאית תקשורת - דור", category: "ילדים", owner: "מורן", status: "todo",
        taskType: "חד-פעמית", dueDate: null, dueTime: "16:30", frequency: "חד-פעמי", priority: "רגיל",
        next: "—", relatedPerson: "דור", projectId: null, subtasks: [],
      },
      {
        id: "TSK-006", name: "קלינאית תקשורת - שי", category: "ילדים", owner: "מורן", status: "todo",
        taskType: "חד-פעמית", dueDate: null, dueTime: "17:15", frequency: "חד-פעמי", priority: "רגיל",
        next: "—", relatedPerson: "שי", projectId: null, subtasks: [],
      },
      {
        id: "TSK-007", name: "לבחור פלטת צבעים לחדר", category: "פרויקטים וחלומות", owner: "מורן", status: "done",
        taskType: "חד-פעמית", dueDate: null, dueTime: null, frequency: "חד-פעמי", priority: "רגיל",
        next: "—", relatedPerson: null, projectId: "PRJ-001", subtasks: [],
      },
      {
        id: "TSK-008", name: "לקנות שטיח לחדר המשחקים", category: "פרויקטים וחלומות", owner: "לירן", status: "todo",
        taskType: "חד-פעמית", dueDate: null, dueTime: null, frequency: "חד-פעמי", priority: "רגיל",
        next: "לבדוק מידות החדר לפני הזמנה", relatedPerson: null, projectId: "PRJ-001", subtasks: [],
      },
    ],
    routines: [
      { id: "ROU-001", name: "סידור וניקיון מטבח בערב", category: "תחזוקת הבית", assignee: "מורן", active: true, notes: null },
      { id: "ROU-002", name: "בדיקת תיקים וציוד לגן/בית ספר", category: "ילדים", assignee: "לירן", active: true, notes: null },
      { id: "ROU-003", name: "השקיית צמחים", category: "תחזוקת הבית", assignee: "לירן", active: true, notes: "רק בקיץ" },
    ],
    routineCompletions: [
      { routineId: "ROU-001", date: plusDays(-2), done: true, by: "מורן" },
      { routineId: "ROU-001", date: plusDays(-1), done: true, by: "לירן" },
      { routineId: "ROU-002", date: plusDays(-1), done: true, by: "לירן" },
    ],
    shopping: [
      { name: "חלב", category: "אוכל", qty: "2", status: "חסר", store: "סופר" },
      { name: "נייר טואלט", category: "טואלטיקה", qty: "1", status: "חסר", store: "פארם" },
    ],
    finance: {
      budgetFree: 2400,
      savingsGoalPct: 35,
      openDecisions: ["האם להקדים סגירת משכנתא או להשאיר כרית ביטחון", "תקרת תקציב לחדר המשחקים"],
    },
    updatesLog: [
      { id: "UPD-001", entityType: "project", entityId: "PRJ-001", date: plusDays(-10), author: "לירן", note: "התחלנו לאסוף רעיונות ותמונות השראה לעיצוב החדר" },
      { id: "UPD-002", entityType: "task", entityId: "TSK-001", date: plusDays(-3), author: "לירן", note: "פנינו לשרברב אבל הוא לא היה זמין השבוע, מחפשים אחר" },
    ],
  };
}
