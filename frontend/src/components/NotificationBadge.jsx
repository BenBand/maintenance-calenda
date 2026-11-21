import { useState, useEffect } from 'react';
import { fetchNotificationCount } from '../services/notifications';

const POLL_MS = 60000;

/**
 * Small pill badge that shows the number of unread notifications. Polls the
 * /notifications/count endpoint so a technician sees new incidents or notices
 * without refreshing the page. Renders nothing when there are zero
 * notifications, so it stays out of the way on a clean dashboard.
 */
export default function NotificationBadge() {
  const [count, setCount] = useState(0);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const data = await fetchNotificationCount();
        if (!cancelled) setCount(Number(data?.total || 0));
      } catch {
        // Silently fail - notifications are a nicety, not critical.
      } finally {
        if (!cancelled && polling) {
          const timer = setTimeout(refresh, POLL_MS);
          return () => clearTimeout(timer);
        }
      }
    };

    refresh();
    return () => {
      cancelled = true;
    };
  }, [polling]);

  if (count === 0) return null;

  return (
    <span
      className="notification-badge"
      role="status"
      aria-label={`${count} new notification${count === 1 ? '' : 's'}`}
      aria-live="polite"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
