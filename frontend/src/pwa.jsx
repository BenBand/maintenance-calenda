export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const basePath = import.meta.env.VITE_BASE_PATH || '/';
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const serviceWorkerUrl = `${normalizedBase}sw.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {});
  });
}
