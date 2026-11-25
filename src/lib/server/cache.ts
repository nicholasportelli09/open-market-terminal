type Entry<T> = { at: number; value: T };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 2000;

/** Tiny in-memory TTL cache with request coalescing, shared by all API routes. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      if (store.size > MAX_ENTRIES) store.clear();
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export function peek<T>(key: string, maxAgeMs: number): T | undefined {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value as T;
  return undefined;
}

export function put<T>(key: string, value: T): void {
  if (store.size > MAX_ENTRIES) store.clear();
  store.set(key, { at: Date.now(), value });
}
