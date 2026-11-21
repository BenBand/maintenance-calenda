import { useState, useEffect } from 'react';
import { apiFetch, readApiData } from './api';

/**
 * Fetch the current user's notification count.
 * Returns { total, incidents, notices }.
 */
export async function fetchNotificationCount() {
  const response = await apiFetch('/notifications/count', {}, { skipRefresh: true, maxRetries: 0 });
  return readApiData(response);
}

/**
 * Hook that polls /notifications/count and returns { total, incidents, notices }.
 */
export function useNotifications() {
  const [counts, setCounts] = useState({ total: 0, incidents: 0, notices: 0 });

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const refresh = async () => {
      try {
        const data = await fetchNotificationCount();
        if (!cancelled) setCounts({ total: data?.total || 0, incidents: data?.incidents || 0, notices: data?.notices || 0 });
      } catch {
        // Silently fail - notifications are a nicety, not critical.
      } finally {
        if (!cancelled) {
          timer = setTimeout(refresh, 60000);
        }
      }
    };

    refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return counts;
}
