// Tiny in-memory TTL cache for read-heavy, rarely-changing data
// (categories, similar places, hub-post stats). Fine for a single-instance
// deployment; if the API ever runs on multiple processes this should be
// swapped for Redis or a shared CDN cache.
//
// Values are plain JSON payloads that have already been serialized by the
// route layer, so callers must be careful to never cache anything that
// depends on the requesting user.

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweepIfDue(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

export function cacheGet<T>(key: string): T | null {
  const now = Date.now();
  sweepIfDue(now);
  const entry = store.get(key);
  if (!entry) return null;
  if (now > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Drop every entry whose key starts with prefix (or everything if omitted). */
export function cacheClear(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// Place-related caches: "similar:" recommendations and "categories:list"
// (whose place counts change as listings get approved/edited). Call this
// from any mutation that can change what public visitors see.
export function invalidatePlaceCaches(): void {
  cacheClear("similar:");
  cacheClear("categories:");
}