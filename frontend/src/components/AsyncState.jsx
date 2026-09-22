export function PageLoader({ label = 'Loading...' }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonPage({ label = 'Loading page...' }) {
  return (
    <div className="skeleton-page" aria-busy="true" aria-label={label}>
      <div className="skeleton skeleton-line skeleton-line--short" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <section className="error-state" role="alert">
      <h1 className="error-state__title">Unable to load this page</h1>
      <p className="error-state__message">{message}</p>
      {onRetry && <button className="button button--primary" type="button" onClick={onRetry}>Try again</button>}
    </section>
  );
}

export function EmptyState({ children }) {
  return <p className="empty-state">{children}</p>;
}
