import { useEffect, useState } from 'react';

/**
 * Prompts for a reload when a new build is waiting behind the service worker.
 * Without this a technician can stay on a stale bundle for the whole shift.
 */
export default function UpdatePrompt() {
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let cancelled = false;
    const check = async () => {
      try {
        const ready = await navigator.serviceWorker.getRegistration();
        if (!cancelled && ready?.waiting) setRegistration(ready);
      } catch {
        // Registration lookups can fail in private mode; nothing to prompt for.
      }
    };

    const onFound = (event) => {
      if (!cancelled && event?.registration) setRegistration(event.registration);
    };

    check();
    navigator.serviceWorker.addEventListener('updatefound', onFound);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('updatefound', onFound);
    };
  }, []);

  if (!registration?.waiting) return null;

  const applyUpdate = () => {
    const waiting = registration.waiting;
    // Skip waiting on the new worker, then reload once it has taken over.
    waiting.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  };

  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <span>A new version is available.</span>
      <button className="button button--primary button--small" type="button" onClick={applyUpdate}>
        Reload
      </button>
    </div>
  );
}
