import { apiFetch, readApiData } from './api';

/**
 * Fetch the current user's notification count (incidents needing attention +
 * active published notices). Returns { total, incidents, notices }.
 */
export async function fetchNotificationCount() {
  const response = await apiFetch('/notifications/count', {}, { skipRefresh: true, maxRetries: 0 });
  return readApiData(response);
}
