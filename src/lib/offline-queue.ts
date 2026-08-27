"use client";

/**
 * A durable outbox for meals logged without a connection.
 *
 * The service worker is deliberately network-only for pages, because a cached
 * dashboard showing yesterday's calories would be worse than an error. But that
 * left logging impossible offline — which is exactly the restaurant-basement,
 * aeroplane, patchy-gym-wifi situation where you most want to record a meal
 * before you forget it.
 *
 * IndexedDB rather than localStorage on purpose: a queued photo is a couple of
 * hundred KB of base64 and would crowd a 5MB string store, and localStorage
 * writes are synchronous on the main thread. This is user data that must not be
 * lost, so it gets real storage.
 */

const DB_NAME = "macronaut-outbox";
const STORE = "pending";
const VERSION = 1;

export type PendingLog = {
  id: string;
  /** Which day the meal belongs to, captured when it was logged, not when synced. */
  date: string;
  queuedAt: string;
} & (
  | { kind: "text"; text: string }
  | { kind: "photo"; imageBase64: string; mimeType: string; note?: string }
);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Every call is wrapped: private mode and blocked site data must not throw. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * A plain Omit collapses a discriminated union into its common keys, which
 * would let a caller mix a text log's fields with a photo's. Distributing over
 * the union keeps the two shapes separate.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type NewPendingLog = DistributiveOmit<PendingLog, "id" | "queuedAt">;

export async function queueLog(
  item: NewPendingLog,
): Promise<PendingLog | null> {
  const record = {
    ...item,
    // crypto.randomUUID needs a secure context; localhost and https both
    // qualify, but fall back rather than lose the meal.
    id:
      globalThis.crypto?.randomUUID?.() ??
      `q-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    queuedAt: new Date().toISOString(),
  } as PendingLog;
  const ok = await withStore("readwrite", (store) => store.put(record));
  return ok === null ? null : record;
}

export async function listQueued(): Promise<PendingLog[]> {
  const all = await withStore<PendingLog[]>("readonly", (store) =>
    store.getAll(),
  );
  return (all ?? []).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeQueued(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function countQueued(): Promise<number> {
  const n = await withStore<number>("readonly", (store) => store.count());
  return n ?? 0;
}
