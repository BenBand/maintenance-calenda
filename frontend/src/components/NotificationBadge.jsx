/**
 * Small pill badge showing a notification count. Accepts a pre-fetched count
 * so multiple navigation links can each display their own badge without
 * hitting the API repeatedly.
 */
export default function NotificationBadge({ count = 0 }) {
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
