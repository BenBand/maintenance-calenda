import { useId } from 'react';
import { Meter } from './Charts';
import { formatMinutes, humanizeKey } from '../utils/datetime';

const STAGES = [
  { key: 'procurement', label: 'Procurement' },
  { key: 'deployed', label: 'Deployment' },
  { key: 'in_service', label: 'In Service' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'retired', label: 'Retired' },
  { key: 'disposed', label: 'Disposal' },
];

const EVENT_LABELS = {
  procurement: 'Procured',
  deployment: 'Deployed',
  maintenance: 'Serviced',
  repair: 'Repaired',
  upgrade: 'Upgraded',
  relocation: 'Relocated',
  retirement: 'Retired',
  disposal: 'Disposed',
  status_change: 'Status changed',
  note: 'Note',
};

function stageIndex(status) {
  const index = STAGES.findIndex((stage) => stage.key === status);
  return index === -1 ? 0 : index;
}

/** Warranty and end-of-life progress, with an explicit expired state. */
function LifeMeter({ label, start, end, tone }) {
  if (!end) return null;
  const endMs = new Date(end).getTime();
  if (Number.isNaN(endMs)) return null;
  const today = Date.now();
  const startMs = start ? new Date(start).getTime() : endMs - 3 * 365 * 24 * 3600 * 1000;
  const span = Math.max(1, endMs - startMs);
  const percent = Math.max(0, Math.min(100, ((today - startMs) / span) * 100));
  const expired = today > endMs;
  const daysLeft = Math.round((endMs - today) / 86400000);

  return (
    <Meter
      label={label}
      value={expired ? 100 : percent}
      max={100}
      tone={expired ? 'danger' : tone}
      display={expired ? 'Expired' : `${Math.round(percent)}%`}
      hint={expired
        ? `Expired ${Math.abs(daysLeft)} days ago`
        : `${daysLeft} days remaining (ends ${String(end).slice(0, 10)})`}
    />
  );
}

export function LifecycleProgress({ status }) {
  const current = stageIndex(status);
  return (
    <ol className="lifecycle-track" aria-label={`Lifecycle stage: ${humanizeKey(status)}`}>
      {STAGES.map((stage, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li className={`lifecycle-track__step lifecycle-track__step--${state}`} key={stage.key}>
            <span className="lifecycle-track__dot" aria-hidden="true" />
            <span className="lifecycle-track__label">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function LifecycleTimeline({ events = [], asset }) {
  const headingId = useId();
  const ordered = [...events].sort((a, b) => {
    const aDate = new Date(a.event_date || 0).getTime();
    const bDate = new Date(b.event_date || 0).getTime();
    if (aDate !== bDate) return bDate - aDate;
    return (b.id || 0) - (a.id || 0);
  });

  return (
    <section className="asset-lifecycle" aria-labelledby={headingId}>
      <h3 className="asset-lifecycle__title" id={headingId}>Lifecycle</h3>

      <LifecycleProgress status={asset?.lifecycle_status} />

      <div className="asset-lifecycle__meters">
        <LifeMeter
          label="Warranty"
          start={asset?.warranty_start}
          end={asset?.warranty_expiry}
          tone="info"
        />
        <LifeMeter
          label="Service life"
          start={asset?.purchase_date}
          end={asset?.end_of_life_date}
          tone="primary"
        />
      </div>

      <dl className="asset-lifecycle__facts">
        <div><dt>Purchase date</dt><dd>{asset?.purchase_date || '—'}</dd></div>
        <div><dt>Warranty expiry</dt><dd>{asset?.warranty_expiry || '—'}</dd></div>
        <div><dt>End of life</dt><dd>{asset?.end_of_life_date || '—'}</dd></div>
        <div><dt>Deployed</dt><dd>{asset?.deployed_date || '—'}</dd></div>
        {asset?.disposal_date && (
          <div>
            <dt>Disposed</dt>
            <dd>
              {asset.disposal_date}
              {asset.disposal_method ? ` · ${asset.disposal_method}` : ''}
              {asset.disposal_reference ? ` (${asset.disposal_reference})` : ''}
            </dd>
          </div>
        )}
        {asset?.lifetime_service_minutes > 0 && (
          <div><dt>Lifetime service time</dt><dd>{formatMinutes(asset.lifetime_service_minutes)}</dd></div>
        )}
      </dl>

      <h4 className="asset-lifecycle__subtitle">History ({ordered.length})</h4>
      {ordered.length === 0 ? (
        <p className="chart-empty">No lifecycle events recorded yet</p>
      ) : (
        <ol className="timeline">
          {ordered.map((event) => (
            <li className="timeline__item" key={event.id}>
              <span className="timeline__marker" aria-hidden="true" />
              <div className="timeline__body">
                <div className="timeline__head">
                  <span className="timeline__type">{EVENT_LABELS[event.event_type] || humanizeKey(event.event_type)}</span>
                  <time className="timeline__date" dateTime={event.event_date}>{String(event.event_date || '').slice(0, 10)}</time>
                </div>
                {event.description && <p className="timeline__description">{event.description}</p>}
                <p className="timeline__meta">
                  {event.to_status && <span className="badge badge--neutral">{humanizeKey(event.to_status)}</span>}
                  {event.performed_by && <span>by {event.performed_by}</span>}
                  {event.created_by_name && <span>logged by {event.created_by_name}</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
