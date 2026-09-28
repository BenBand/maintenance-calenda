/**
 * Offline support for field use.
 *
 * Two jobs:
 *  1. `readCache` remembers the last successful GET per URL so a technician in
 *     a basement server room still sees today's schedule.
 *  2. `enqueueMutation` parks a write that could not reach the network and
 *     replays it when connectivity returns, so a service record signed offline is
 *     not lost.
 *
 * The queue is deliberately small and last-write-wins-free: entries are retried
 * in order, and a 4xx other than 408/429 is treated as a permanent rejection
 * that is dropped rather than retried forever.
 */

const CACHE_PREFIX = 'mcc.cache:';
const QUEUE_KEY = 'mcc.queue';
const MAX_CACHE_ENTRIES = 120;
const MAX_QUEUE_ENTRIES = 50;
const SYNC_TAG = 'mcc-outbox';

const cache = new Map();
let queueLoaded = false;
let queue = [];
const listeners = new Set();

function safeStorage() {
  try {
    if (typeof window !== 'undefined') return window.localStorage;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function pruneCache() {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function readCacheKey(method, url) {
  return `${CACHE_PREFIX}${String(method || 'GET').toUpperCase()} ${url}`;
}

export function readCache(method, url) {
  const storage = safeStorage();
  const key = readCacheKey(method, url);
  if (cache.has(key)) return cache.get(key);

  const raw = storage?.getItem(key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    cache.set(key, entry);
    return entry;
  } catch {
    storage?.removeItem(key);
    return null;
  }
}

export function writeCache(method, url, body) {
  const storage = safeStorage();
  if (!storage) return;
  const entry = { savedAt: Date.now(), body };
  cache.set(readCacheKey(method, url), entry);
  try {
    storage.setItem(readCacheKey(method, url), JSON.stringify(entry));
    pruneCache();
  } catch {
    // A full quota should not break a working request; the in-memory copy
    // still serves this session.
  }
}

export function clearCache() {
  const storage = safeStorage();
  cache.clear();
  if (!storage) return;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && key.startsWith(CACHE_PREFIX)) storage.removeItem(key);
  }
}

export function isOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function persistQueue() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    queue = queue.slice(-MAX_QUEUE_ENTRIES);
  }
}

function loadQueue() {
  if (queueLoaded) return queue;
  const storage = safeStorage();
  queueLoaded = true;
  const raw = storage?.getItem(QUEUE_KEY);
  if (!raw) return queue;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) queue = parsed;
  } catch {
    storage?.removeItem(QUEUE_KEY);
  }
  return queue;
}

export function getPendingMutations() {
  return loadQueue();
}

export function onQueueChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyQueueChange() {
  listeners.forEach((listener) => listener(queue));
}

export function enqueueMutation(entry) {
  const current = loadQueue();
  current.push({ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: Date.now() });
  // Drop the oldest rather than refuse the newest: the technician's most
  // recent action is the one they care about.
  if (current.length > MAX_QUEUE_ENTRIES) queue = current.slice(-MAX_QUEUE_ENTRIES);
  else queue = current;
  persistQueue();
  notifyQueueChange();
  requestBackgroundSync();
  return queue.length;
}

function dequeue(id) {
  queue = loadQueue().filter((item) => item.id !== id);
  persistQueue();
  notifyQueueChange();
}

export async function requestBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await registration.sync.register(SYNC_TAG);
      return;
    }
  } catch {
    // Background Sync is unavailable (iOS Safari); the online listener and
    // the periodic retry below cover that case.
  }
}

/**
 * Replay queued writes. `send` is injected by the API client so this module
 * never depends on the network layer directly, which keeps it testable.
 */
export async function flushQueue(send) {
  if (!isOnline()) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;

  for (const item of [...loadQueue()]) {
    try {
      // Sequential on purpose: a service record must land before the
      // lifecycle event that follows it.
      // eslint-disable-next-line no-await-in-loop
      await send(item);
      dequeue(item.id);
      sent += 1;
    } catch (error) {
      if (error?.permanent) {
        dequeue(item.id);
        failed += 1;
        continue;
      }
      failed += 1;
      break;
    }
  }

  return { sent, failed };
}

/** A Response shaped like the API's, so callers need no special case. */
export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-MCC-Offline': 'true', ...headers },
  });
}

export { SYNC_TAG };
