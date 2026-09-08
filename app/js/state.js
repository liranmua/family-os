// Family OS — state בזיכרון. שלב 2: מקור האמת הוא Firestore (דרך cloud.js).
// IndexedDB (db.js) נשאר רק כמקור למיגרציה החד-פעמית וכגיבוי מקומי — לא נכתב אליו יותר
// חוץ מ-meta מקומי-למכשיר (notifiedIds, notifPermissionAsked).

import * as db from "./db.js";
import { buildSeed, SEED_VERSION } from "./seed.js";
import * as cloud from "./cloud.js";
import { nextId, todayStr } from "./constants.js";

export const FINANCE_DEFAULT = { budgetFree: null, savingsGoalPct: null, openDecisions: [] };

export const state = {
  tasks: [],
  routines: [],
  routineCompletions: [],
  projects: [],
  shopping: [],
  updatesLog: [],
  finance: { ...FINANCE_DEFAULT },
  sync: { ready: false, fromCache: true, pending: false, migration: null },
};

const ENT = {
  task: "tasks", routine: "routines", project: "projects",
  shopping: "shopping", routineCompletion: "routineCompletions", update: "updatesLog",
};
const PREFIX = { tasks: "TSK", routines: "ROU", projects: "PRJ", shopping: "SHP", updatesLog: "UPD" };

function byId(a, b) { return String(a.id).localeCompare(String(b.id)); }
const SORTERS = {
  tasks: byId, routines: byId, projects: byId, updatesLog: byId, shopping: byId,
  routineCompletions: (a, b) => String(a.date || "").localeCompare(String(b.date || "")),
};

let _onChange = () => {};
let _onSync = () => {};
const _unsubs = [];
export function setChangeHandler(fn) { _onChange = fn; }
export function setSyncHandler(fn) { _onSync = fn; }

// ---- meta מקומי-למכשיר (לא מסתנכרן) ----
export async function getMeta(key, fallback = null) {
  const row = await db.get("meta", key);
  return row ? row.value : fallback;
}
export async function setMeta(key, value) {
  await db.put("meta", { key, value });
}

// ---- טעינה + מיגרציה ----

function normalizeLocal(snap) {
  // הגנה על נתוני שלב 1 ישנים שאולי נשמרו עם id מספרי (autoIncrement)
  const fix = (rows, mk) =>
    (rows || []).map((r, i) => (r.id == null || typeof r.id === "number" ? { ...r, id: mk(r, i) } : r));
  return {
    tasks: snap.tasks || [],
    routines: snap.routines || [],
    projects: snap.projects || [],
    updatesLog: snap.updatesLog || [],
    shopping: fix(snap.shopping, (_r, i) => "SHP-" + String(i + 1).padStart(3, "0")),
    routineCompletions: fix(snap.routineCompletions, (r) => `${r.routineId || "ROU"}__${r.date || ""}`),
    finance: snap.finance || null,
  };
}

export async function loadState() {
  await db.openDB();
  if (!(await db.get("meta", "seedVersion"))) await seedFresh();

  // עותק מקומי (שלב 1) — מקור למיגרציה + גיבוי. לא נמחק.
  const names = ["tasks", "routines", "routineCompletions", "projects", "shopping", "updatesLog"];
  const rows = await Promise.all(names.map((s) => db.getAll(s)));
  const localRaw = { finance: await getMeta("finance", null) };
  names.forEach((n, i) => { localRaw[n] = rows[i]; });

  state.sync.migration = await cloud.runMigration(normalizeLocal(localRaw));

  // מכאן — מאזינים בזמן אמת. Firestore הוא מקור האמת.
  for (const name of cloud.COLLECTIONS) {
    _unsubs.push(
      cloud.listenCollection(
        name,
        (docs) => {
          docs.sort(SORTERS[name] || byId);
          state[name] = docs;
          state.sync.ready = true;
          _onChange();
        },
        (meta) => {
          state.sync.fromCache = meta.fromCache;
          state.sync.pending = meta.pending;
          _onSync(state.sync);
        }
      )
    );
  }
  _unsubs.push(
    cloud.listenMeta("finance", (val) => {
      state.finance = { ...FINANCE_DEFAULT, ...(val || {}) };
      _onChange();
    })
  );
}

async function seedFresh() {
  const s = buildSeed();
  await Promise.all([
    db.bulkPut("tasks", s.tasks),
    db.bulkPut("routines", s.routines),
    db.bulkPut("routineCompletions", s.routineCompletions),
    db.bulkPut("projects", s.projects),
    db.bulkPut("shopping", s.shopping),
    db.bulkPut("updatesLog", s.updatesLog),
  ]);
  if (s.finance) await db.put("meta", { key: "finance", value: s.finance });
  await db.put("meta", { key: "seedVersion", value: SEED_VERSION });
}

// "אפס הכל" — מנקה גם את הענן (משותף!) וגם את הגיבוי המקומי, וזורע מחדש.
export async function resetAll() {
  const s = buildSeed();
  for (const n of cloud.COLLECTIONS) {
    await cloud.clearCollection(n);
    await cloud.bulkWrite(n, s[n] || []);
  }
  await cloud.writeMeta("finance", s.finance);
  await db.clearAll();
  await seedFresh();
  // ה-listeners יעדכנו את ה-state.
}

// ---- CRUD ----

export async function upsert(entity, obj) {
  const name = ENT[entity];
  if (obj.id == null) {
    if (name === "routineCompletions") obj.id = `${obj.routineId || "ROU"}__${obj.date || todayStr()}`;
    else obj.id = nextId(PREFIX[name], state[name].map((x) => x.id));
  }
  const list = state[name];
  const i = list.findIndex((x) => String(x.id) === String(obj.id));
  if (i > -1) list[i] = obj;
  else list.push(obj);
  list.sort(SORTERS[name] || byId);
  _onChange();
  try {
    await cloud.writeDoc(name, obj);
  } catch (e) {
    console.warn("cloud writeDoc failed:", name, e);
  }
  return obj;
}

export async function remove(entity, id) {
  const name = ENT[entity];
  const list = state[name];
  const i = list.findIndex((x) => String(x.id) === String(id));
  if (i > -1) list.splice(i, 1);
  _onChange();
  try {
    await cloud.removeDoc(name, id);
  } catch (e) {
    console.warn("cloud removeDoc failed:", name, e);
  }
}

export async function saveFinance(finance) {
  state.finance = { ...FINANCE_DEFAULT, ...finance };
  _onChange();
  try {
    await cloud.writeMeta("finance", state.finance);
  } catch (e) {
    console.warn("cloud writeMeta(finance) failed:", e);
  }
}
