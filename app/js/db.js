// Family OS — עטיפת IndexedDB. אחסון מקומי בלבד (שלב 1). אין ענן, אין סנכרון.

const DB_NAME = "family-os";
const DB_VERSION = 1;

// שם store -> אפשרויות objectStore
const STORES = {
  tasks: { keyPath: "id" },
  routines: { keyPath: "id" },
  routineCompletions: { keyPath: "id", autoIncrement: true },
  projects: { keyPath: "id" },
  shopping: { keyPath: "id", autoIncrement: true },
  updatesLog: { keyPath: "id" },
  meta: { keyPath: "key" },
};

export const STORE_NAMES = Object.keys(STORES);

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, opts);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return wrap(tx(db, store, "readonly").getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return wrap(tx(db, store, "readonly").get(key));
}

export async function put(store, value) {
  const db = await openDB();
  const os = tx(db, store, "readwrite");
  const key = await wrap(os.put(value));
  return key;
}

export async function del(store, key) {
  const db = await openDB();
  return wrap(tx(db, store, "readwrite").delete(key));
}

export async function bulkPut(store, values) {
  const db = await openDB();
  const os = tx(db, store, "readwrite");
  await Promise.all(values.map((v) => wrap(os.put(v))));
}

export async function clearStore(store) {
  const db = await openDB();
  return wrap(tx(db, store, "readwrite").clear());
}

export async function clearAll() {
  await Promise.all(STORE_NAMES.map((s) => clearStore(s)));
}
