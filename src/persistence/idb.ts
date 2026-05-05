/**
 * Phase 38+: minimal async key-value wrapper over IndexedDB.
 *
 * Why: localStorage caps at ~5MB per origin. After Phase 38g amplified
 * lexical capacity (tier-3 lexicons grow to ~2-3k entries) plus all
 * the per-language state Phase 25-37 added (correspondences, bound
 * morphemes, synonyms, momentum, cascade flags), a mature run's
 * autosave easily exceeds 5MB and triggers "Storage full" warnings.
 * IndexedDB has a multi-GB quota and supports binary blobs, async
 * I/O, and large object stores natively.
 *
 * Schema: a single object store `kv` with `key` as the keyPath. Values
 * are stored as the parsed JS objects (not stringified) — IDB
 * structured-clone handles the serialisation. This avoids the JSON
 * round-trip overhead that bottlenecks localStorage.
 *
 * API mirrors localStorage but is async:
 * - `idbGet(key)` → Promise<unknown | null>
 * - `idbSet(key, value)` → Promise<{ok, reason?}>
 * - `idbRemove(key)` → Promise<void>
 * - `idbKeys()` → Promise<string[]>
 *
 * Errors during open or transaction surface as console warnings; the
 * caller decides how to react.
 */

const DB_NAME = "lev";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      // Another tab holds an older version. Surface but don't block.
      console.warn("[idb] open blocked — another tab holds an older DB version");
    };
  });
  return dbPromise;
}

export type IdbWriteResult =
  | { ok: true }
  | { ok: false; reason: "quota" | "disabled" | "other" };

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then((db) =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  );
}

export async function idbGet(key: string): Promise<unknown | null> {
  try {
    const result = await withStore<{ key: string; value: unknown } | undefined>(
      "readonly",
      (store) => store.get(key) as IDBRequest<{ key: string; value: unknown } | undefined>,
    );
    return result ? result.value : null;
  } catch (e) {
    console.warn(`[idb] get(${key}) failed:`, e);
    return null;
  }
}

export async function idbSet(key: string, value: unknown): Promise<IdbWriteResult> {
  if (typeof indexedDB === "undefined") {
    return { ok: false, reason: "disabled" };
  }
  try {
    await withStore("readwrite", (store) => store.put({ key, value }));
    return { ok: true };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    const isQuota =
      name === "QuotaExceededError" ||
      name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      name === "QuotaExceededError";
    return { ok: false, reason: isQuota ? "quota" : "other" };
  }
}

export async function idbRemove(key: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(key));
  } catch (e) {
    console.warn(`[idb] remove(${key}) failed:`, e);
  }
}

export async function idbKeys(): Promise<string[]> {
  try {
    const result = await withStore<IDBValidKey[]>(
      "readonly",
      (store) => store.getAllKeys(),
    );
    return result.map((k) => String(k));
  } catch (e) {
    console.warn(`[idb] keys() failed:`, e);
    return [];
  }
}

/**
 * Reset the in-memory db handle. Useful in tests that want to start
 * with a fresh DB; production code rarely needs this.
 */
export function _resetIdbHandle(): void {
  dbPromise = null;
}
