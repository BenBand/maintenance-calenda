const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
import {
  clearCache, enqueueMutation, flushQueue, isOnline, jsonResponse, readCache, writeCache,
} from './offline';

const TOKEN_KEY = 'token';
const CSRF_TOKEN_KEY = 'csrfToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 5000;
const responseJsonCache = new WeakMap();
const sessionListeners = new Set();
let authAdapter = null;

function createInterceptorManager() {
  const handlers = new Map();
  let nextId = 1;

  return {
    use(handler) {
      if (typeof handler !== 'function') throw new TypeError('Interceptor must be a function');
      const id = nextId;
      nextId += 1;
      handlers.set(id, handler);
      return id;
    },
    eject(id) {
      handlers.delete(id);
    },
  };
}

const requestInterceptorManager = createInterceptorManager();
const responseInterceptorManager = createInterceptorManager();
const errorInterceptorManager = createInterceptorManager();

export function configureApiClient(adapter) {
  authAdapter = adapter || null;
}

let refreshPromise = null;

function getStorage() {
  try {
    if (typeof window !== 'undefined') return window.sessionStorage;
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function getSession() {
  const storage = getStorage();
  const storedSession = storage ? {
    token: storage.getItem(TOKEN_KEY),
    csrfToken: storage.getItem(CSRF_TOKEN_KEY),
    refreshToken: storage.getItem(REFRESH_TOKEN_KEY),
  } : {};
  return { ...storedSession, ...(authAdapter?.getCredentials?.() || {}) };
}

export function setSession(session) {
  const storage = getStorage();
  const current = getSession();
  const next = { ...current, ...session };
  // The response cache is scoped to whoever is signed in; a different user (or
  // a fresh login after logout) must not read the previous user's data.
  if (session && session.token && session.token !== current.token) clearCache();

  if (storage) {
    Object.entries(next).forEach(([key, value]) => {
      if (value == null) storage.removeItem(key);
      else storage.setItem(key, value);
    });
  }

  notifySessionChange(next);
  authAdapter?.setCredentials?.(next);
  return next;
}

export function clearSession() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(CSRF_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
  }
  clearCache();
  notifySessionChange({ token: null, csrfToken: null, refreshToken: null });
  authAdapter?.clearCredentials?.();
}

export function onSessionChange(listener) {
  if (typeof listener !== 'function') return () => {};
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notifySessionChange(session) {
  sessionListeners.forEach((listener) => listener(session));
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('auth-session-changed', { detail: session }));
}

function resolveUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

function getLogUrl(url) {
  try {
    const parsed = new URL(resolveUrl(url), typeof window !== 'undefined' ? window.location.href : undefined);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return resolveUrl(url).split('?')[0];
  }
}

function loggingEnabled(config) {
  return config.log !== false && import.meta.env?.VITE_API_LOGGING !== 'false';
}

function logRequest(context) {
  if (!loggingEnabled(context.config)) return;
  console.debug('[api] -->', context.method, getLogUrl(context.url), 'attempt', context.attempt + 1);
}

function logResponse(context, response, startedAt) {
  if (!loggingEnabled(context.config)) return;
  const duration = typeof performance !== 'undefined' ? Math.round(performance.now() - startedAt) : 0;
  console.debug('[api] <--', response.status, context.method, getLogUrl(context.url), `${duration}ms`);
}

export class ApiError extends Error {
  constructor(message, { status, data, response, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.response = response;
  }
}

function getErrorMessage(data, status) {
  if (data?.error) return data.error;
  if (data?.message) return data.message;
  if (Array.isArray(data?.details) && data.details.length > 0) {
    return data.details.map((detail) => detail.message).filter(Boolean).join(', ');
  }
  return `Request failed with status ${status}`;
}

export async function readResponseJson(response) {
  if (!response) return null;
  if (responseJsonCache.has(response)) return responseJsonCache.get(response);

  const promise = (async () => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    try {
      const clone = typeof response.clone === 'function' ? response.clone() : response;
      return await clone.json();
    } catch {
      return null;
    }
  })();

  responseJsonCache.set(response, promise);
  return promise;
}

export async function readApiData(response) {
  const data = await readResponseJson(response);
  if (Array.isArray(data)) return data;
  if (data && Object.prototype.hasOwnProperty.call(data, 'data')) return data.data;
  return data || null;
}

/**
 * Read a list out of a response that may be a bare array, a `{ data: [...] }`
 * envelope, or an object with a named list such as
 * `{ schedules: [...], recurrences: [...] }`.
 *
 * `readApiData` returns the envelope object for the last shape, so calling
 * `.filter` on its result throws. Anything that renders a collection should
 * use this instead and declare which keys may hold the list.
 */
export async function readApiArray(response, ...keys) {
  const data = await readResponseJson(response);
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function createRequestContext(url, options, config, legacyToken, legacyCsrfToken) {
  const requestOptions = { ...options };
  const method = String(requestOptions.method || 'GET').toUpperCase();
  const storedSession = getSession();
  const context = {
    url,
    method,
    options: requestOptions,
    headers: new Headers(requestOptions.headers || {}),
    config: { ...config },
    credentials: {
      ...storedSession,
      ...(legacyToken ? { token: legacyToken } : {}),
      ...(legacyCsrfToken ? { csrfToken: legacyCsrfToken } : {}),
    },
    attempt: 0,
    refreshed: false,
  };

  context.options.method = method;
  context.options.credentials = context.options.credentials || 'include';
  return context;
}

function applyAuthHeaders(context) {
  if (context.config.skipAuth) return;
  if (context.credentials.token) context.headers.set('Authorization', `Bearer ${context.credentials.token}`);
  if (context.credentials.csrfToken) context.headers.set('X-CSRF-Token', context.credentials.csrfToken);
  if (context.options.body && !context.headers.has('Content-Type')) {
    context.headers.set('Content-Type', 'application/json');
  }
}

function mergeInterceptorResult(context, result) {
  if (!result || typeof result !== 'object') return context;
  const headers = result.headers ? new Headers(result.headers instanceof Headers ? result.headers : result.headers) : context.headers;
  return {
    ...context,
    ...result,
    headers,
    options: { ...context.options, ...(result.options || {}) },
    config: { ...context.config, ...(result.config || {}) },
    credentials: { ...context.credentials, ...(result.credentials || {}) },
  };
}

async function runRequestInterceptors(context) {
  let current = context;
  for (const handler of requestInterceptorManager.handlers.values()) {
    current = mergeInterceptorResult(current, await handler(current));
  }
  applyAuthHeaders(current);
  return current;
}

async function runResponseInterceptors(response, context) {
  let current = response;
  for (const handler of responseInterceptorManager.handlers.values()) {
    const result = await handler({ response: current, context });
    if (result !== undefined) current = result;
  }
  return current;
}

async function runErrorInterceptors(error, context) {
  let current = error;
  for (const handler of errorInterceptorManager.handlers.values()) {
    const result = await handler({ error: current, context });
    if (result !== undefined) current = result;
  }
  throw current;
}

function getMaxRetries(context) {
  if (context.config.retry === false) return 0;
  if (Number.isInteger(context.config.maxRetries) && context.config.maxRetries >= 0) return context.config.maxRetries;
  if (context.config.retry === true) return DEFAULT_MAX_RETRIES;
  return RETRYABLE_METHODS.has(context.method) ? DEFAULT_MAX_RETRIES : 0;
}

function canReplayBody(body) {
  return body == null || typeof body === 'string' || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams;
}

function canRetry(context, response) {
  if (context.attempt >= getMaxRetries(context)) return false;
  if (context.options.signal?.aborted) return false;
  // Retrying a request we already know cannot reach the network just delays
  // the cached response or the queued write.
  if (!isOnline()) return false;
  if (!canReplayBody(context.options.body)) return false;
  if (context.config.retry === true) return true;
  return RETRYABLE_METHODS.has(context.method);
}

function getRetryAfter(response) {
  const value = response?.headers.get('Retry-After');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) return Math.min(Math.max(0, timestamp - Date.now()), MAX_RETRY_DELAY_MS);
  return null;
}

function getRetryDelay(response, attempt) {
  const retryAfter = getRetryAfter(response);
  if (retryAfter != null) return retryAfter;
  const exponential = Math.min(BASE_RETRY_DELAY_MS * (2 ** attempt), MAX_RETRY_DELAY_MS);
  return exponential + Math.floor(Math.random() * 50);
}

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function discardResponse(response) {
  try {
    await response.body?.cancel();
  } catch {
  }
}

async function fetchWithRetries(context) {
  const maxRetries = getMaxRetries(context);
  let attempt = 0;

  while (true) {
    context.attempt = attempt;
    context.credentials = context.refreshed ? getSession() : { ...getSession(), ...context.credentials };
    applyAuthHeaders(context);
    const { skipAuth: _skipAuth, skipRefresh: _skipRefresh, maxRetries: _maxRetries, retry: _retry, log: _log, ...fetchOptions } = context.options;
    fetchOptions.headers = context.headers;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    logRequest(context);

    let response;
    try {
      response = await fetch(resolveUrl(context.url), fetchOptions);
    } catch (error) {
      if (!canRetry(context, null)) throw new ApiError(error.message || 'Network request failed', { cause: error });
      await sleep(getRetryDelay(null, attempt));
      attempt += 1;
      continue;
    }

    logResponse(context, response, startedAt);
    const retryableStatus = RETRYABLE_STATUSES.has(response.status);
    if (retryableStatus && canRetry(context, response)) {
      await discardResponse(response);
      await sleep(getRetryDelay(response, attempt));
      attempt += 1;
      continue;
    }

    if (attempt >= maxRetries || !retryableStatus) return response;
    await discardResponse(response);
    attempt += 1;
  }
}

async function shouldRefresh(response, context) {
  if (context.config.skipRefresh || context.refreshed) return false;
  if (context.url.includes('/auth/login') || context.url.includes('/auth/refresh')) return false;
  if (response.status === 401) return Boolean(getSession().refreshToken);
  if (response.status !== 403) return false;

  const data = await readResponseJson(response);
  return /expired|invalid token/i.test(data?.error || '') && Boolean(getSession().refreshToken);
}

async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const session = getSession();
    if (!session.refreshToken) throw new ApiError('Refresh token missing', { status: 401 });

    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    if (import.meta.env?.VITE_API_LOGGING !== 'false') {
      console.debug('[api] --> POST', getLogUrl('/auth/refresh'));
    }

    let response;
    try {
      response = await fetch(resolveUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch (error) {
      clearSession();
      throw new ApiError(error.message || 'Unable to refresh session', { cause: error });
    }

    const data = await readResponseJson(response);
    if (import.meta.env?.VITE_API_LOGGING !== 'false') {
      const duration = typeof performance !== 'undefined' ? Math.round(performance.now() - startedAt) : 0;
      console.debug('[api] <--', response.status, 'POST', getLogUrl('/auth/refresh'), `${duration}ms`);
    }

    if (!response.ok) {
      clearSession();
      throw new ApiError(getErrorMessage(data, response.status), { status: response.status, data, response });
    }

    setSession({
      token: data.token,
      csrfToken: data.csrfToken,
      refreshToken: data.refreshToken || session.refreshToken,
    });
    return data;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function handleErrorResponse(response, context) {
  const data = await readResponseJson(response);
  const message = getErrorMessage(data, response.status);
  if (response.status === 401 && !context.config.skipRefresh && !getSession().refreshToken) {
    clearSession();
  }
  throw new ApiError(message, { status: response.status, data, response });
}

export async function downloadPdf(url, filename) {
  const response = await apiFetch(url, { method: 'GET' }, { retry: false });
  if (!response.ok) {
    const data = await readResponseJson(response);
    throw new ApiError(getErrorMessage(data, response.status), { status: response.status, data, response });
  }
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

const CACHEABLE_METHODS = new Set(['GET', 'HEAD']);
const QUEUEABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Methods whose reads are safe to serve from the last known good response. */
function isCacheable(context) {
  if (!CACHEABLE_METHODS.has(context.method)) return false;
  if (context.config.noStore) return false;
  // Never serve a cached body to the login or refresh endpoints.
  if (context.url.includes('/auth/')) return false;
  return true;
}

function canQueue(context) {
  if (!QUEUEABLE_METHODS.has(context.method)) return false;
  if (context.config.noQueue) return false;
  if (context.config.skipAuth) return false;
  // A queued write would replay with a stale CSRF token, so only the JSON
  // payloads a page actually forms are eligible.
  return typeof context.options.body === 'string';
}

function hasNetworkError(error) {
  return error instanceof ApiError && error.status == null;
}

async function cacheSuccessfulRead(context, response) {
  if (!isCacheable(context) || !response.ok || typeof response.clone !== 'function') return;
  try {
    const data = await readResponseJson(response.clone());
    if (data != null) writeCache(context.method, resolveUrl(context.url), data);
  } catch {
    // A caching failure must never surface as a request failure.
  }
}

function cachedResponse(context) {
  const entry = readCache(context.method, resolveUrl(context.url));
  if (!entry) return null;
  return jsonResponse(entry.body, {
    status: 200,
    headers: { 'X-MCC-Cached-At': String(entry.savedAt) },
  });
}

function queueMutation(context) {
  const count = enqueueMutation({
    url: context.url,
    method: context.method,
    body: context.options.body,
  });
  return jsonResponse(
    { queued: true, pending: count, message: 'Saved offline. It will sync when you are back online.' },
    { status: 202 },
  );
}

/**
 * Handle a transport failure. Reads fall back to the last cached response when
 * one exists; writes are parked in the outbox. Anything else rethrows, so a
 * genuine server error is never masked.
 */
function handleTransportFailure(context, error) {
  if (!hasNetworkError(error)) throw error;

  if (isCacheable(context)) {
    const cached = cachedResponse(context);
    if (cached) return cached;
  }

  if (!isOnline() && canQueue(context)) return queueMutation(context);

  throw error;
}

/** Replay parked writes. Called on reconnect, on app start, and by sync. */
export async function syncPendingMutations() {
  return flushQueue(async (item) => {
    const response = await apiFetch(
      item.url,
      { method: item.method, body: item.body },
      { noQueue: true, retry: false },
    );
    if (!response.ok) {
      const error = new ApiError(getErrorMessage(await readResponseJson(response), response.status), {
        status: response.status,
      });
      // 4xx other than the throttling/timeout cases means the request itself is
      // bad, so retrying it forever would wedge the queue behind it.
      if (error.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status)) {
        error.permanent = true;
      }
      throw error;
    }
  });
}

let offlineSyncStarted = false;

/** Attach the reconnect listener. Safe to call more than once. */
export function startOfflineSync() {
  if (offlineSyncStarted || typeof window === 'undefined') return;
  offlineSyncStarted = true;
  window.addEventListener('online', () => {
    syncPendingMutations().catch(() => {});
  });
  if (isOnline()) syncPendingMutations().catch(() => {});
}

export async function apiFetch(url, options = {}, configOrToken = {}, legacyCsrfToken) {
  let config = configOrToken && typeof configOrToken === 'object' ? configOrToken : {};
  let legacyToken = typeof configOrToken === 'string' ? configOrToken : configOrToken?.token;
  if (legacyToken && typeof configOrToken === 'object') legacyCsrfToken = legacyCsrfToken || configOrToken.csrfToken;

  let context = createRequestContext(url, options, config, legacyToken, legacyCsrfToken);
  try {
    context = await runRequestInterceptors(context);
    let response = await fetchWithRetries(context);

    if (await shouldRefresh(response, context)) {
      await refreshSession();
      context.refreshed = true;
      context.attempt = 0;
      response = await fetchWithRetries(context);
    }

    response = await runResponseInterceptors(response, context);
    if (!response.ok) return handleErrorResponse(response, context);
    await cacheSuccessfulRead(context, response);
    return response;
  } catch (error) {
    try {
      return runErrorInterceptors(error, context);
    } catch (finalError) {
      return handleTransportFailure(context, finalError);
    }
  }
}

export const apiClient = {
  fetch: apiFetch,
  request: apiFetch,
  downloadPdf,
  getSession,
  setSession,
  clearSession,
  configure: configureApiClient,
  onSessionChange,
  refresh: refreshSession,
  interceptors: {
    request: requestInterceptorManager,
    response: responseInterceptorManager,
    error: errorInterceptorManager,
  },
};
export { API_BASE };
export default apiClient;
