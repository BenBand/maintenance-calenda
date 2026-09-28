import { useEffect, useState } from 'react';

/**
 * Tells the user when the app is running on cached data. Field staff need to
 * know a screen is stale before they act on it.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span aria-hidden="true">⚠</span>
      <span>
        Offline. Showing the last saved data, and new work will sync when the connection returns.
      </span>
    </div>
  );
}
