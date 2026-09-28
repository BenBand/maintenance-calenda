import { syncPendingMutations } from './services/api';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const basePath = import.meta.env.VITE_BASE_PATH || '/';
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const serviceWorkerUrl = `${normalizedBase}sw.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {});
  });

  // The worker cannot read the session token, so it delegates replaying the
  // offline outbox back to the page.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'FLUSH_OUTBOX') syncPendingMutations().catch(() => {});
  });
}
