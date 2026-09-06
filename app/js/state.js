// Family OS — state בזיכרון + כתיבה-דרך ל-IndexedDB.
// כל mutation עובר דרך כאן: קודם מעדכן את הזיכרון, מיד אחר כך שומר ב-DB.

import * as db from "./db.js";
import { buildSeed, SEED_VERSION } from "./seed.js";

export const state = {
  tasks: [],
  routines: [],
  routineCompletions: [],
  projects: [],
  shopping: [],
  updatesLog: [],
};

// ---- טעינה / זריעה ----

export async function loadState() {
  await db.openDB();
  const seeded = await db.get("meta", "seedVersion");
  if (!seeded) {
    await seedFresh();
  }
  const [tasks, routines, routineCompletions, projects, shopping, updatesLog] = await Promise.all([
    db.getAll("tasks"),
    db.getAll("routines"),
    db.getAll("routineCompletions"),
    db.getAll("projects"),
    db.getAll("shopping"),
    db.getAll("updatesLog"),
  ]);
  state.tasks = tasks;
  state.routines = routines;
  state.routineCompletions = routineCompletions;
  state.projects = projects;
  state.shopping = shopping;
  state.updatesLog = updatesLog;
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
  await db.put("meta", { key: "seedVersion", value: SEED_VERSION });
}

export async function resetAll({ reseed = true } = {}) {
  await db.clearAll();
  if (reseed) {
    await seedFresh();
  } else {
    await db.put("meta", { key: "seedVersion", value: SEED_VERSION });
  }
  await loadState();
}

// ---- meta ----

export async function getMeta(key, fallback = null) {
  const row = await db.get("meta", key);
  return row ? row.value : fallback;
}
export async function setMeta(key, value) {
  await db.put("meta", { key, value });
}

// ---- CRUD גנרי לפי ישות ----
// entity: 'task' | 'routine' | 'project' | 'shopping' | 'routineCompletion' | 'update'

const MAP = {
  task: { store: "tasks", arr: () => state.tasks },
  routine: { store: "routines", arr: () => state.routines },
  project: { store: "projects", arr: () => state.projects },
  shopping: { store: "shopping", arr: () => state.shopping },
  routineCompletion: { store: "routineCompletions", arr: () => state.routineCompletions },
  update: { store: "updatesLog", arr: () => state.updatesLog },
};

export async function upsert(entity, obj) {
  const { store, arr } = MAP[entity];
  const list = arr();
  const kp = store === "routineCompletions" || store === "shopping" ? "id" : "id";
  if (obj[kp] != null) {
    const i = list.findIndex((x) => x[kp] === obj[kp]);
    if (i > -1) list[i] = obj;
    else list.push(obj);
    await db.put(store, obj);
  } else {
    const key = await db.put(store, obj); // autoIncrement
    obj.id = key;
    list.push(obj);
  }
  return obj;
}

export async function remove(entity, id) {
  const { store, arr } = MAP[entity];
  const list = arr();
  const i = list.findIndex((x) => x.id === id);
  if (i > -1) list.splice(i, 1);
  await db.del(store, id);
}
