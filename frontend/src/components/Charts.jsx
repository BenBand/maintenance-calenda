import { useId } from 'react';
import './charts.css';

/**
 * Small SVG chart set for the analytics dashboard.
 *
 * Hand-rolled rather than pulled from a charting library: the app currently
 * ships no chart dependency, and these need to inherit the existing CSS custom
 * properties for light/dark themes instead of a library's own palette.
 * Every chart exposes a text alternative so it is not colour-only information.
 */

function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function shortNumber(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}k`;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

/**
 * Grouped bar chart. `series` is an array of `{ key, label, color }` and each
 * datum supplies the matching numeric value.
 */
export function BarChart({
  data = [],
  series = [{ key: 'value', label: 'Value' }],
  height = 220,
  valueFormatter = shortNumber,
  caption,
  emptyMessage = 'No data for this period',
}) {
  const titleId = useId();
  if (!data.length) {
    return <p className="chart-empty">{emptyMessage}</p>;
  }

  const width = 720;
  const padding = { top: 16, right: 12, bottom: 44, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = niceMax(Math.max(
    1,
    ...data.flatMap((datum) => series.map((s) => Number(datum[s.key]) || 0)),
  ));

  const groupWidth = plotWidth / data.length;
  const barWidth = Math.max(4, (groupWidth * 0.68) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${caption || 'Bar chart'}: ${data.length} categories`}
      >
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / max) * plotHeight;
          return (
            <g key={tick}>
              <line
                className="chart__gridline"
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
              />
              <text className="chart__axis-label" x={padding.left - 8} y={y + 4} textAnchor="end">
                {valueFormatter(tick)}
              </text>
            </g>
          );
        })}

        {data.map((datum, index) => {
          const groupX = padding.left + index * groupWidth;
          return series.map((s, seriesIndex) => {
            const value = Number(datum[s.key]) || 0;
            const barHeight = max > 0 ? (value / max) * plotHeight : 0;
            const x = groupX + (groupWidth - barWidth * series.length) / 2 + seriesIndex * barWidth;
            const y = padding.top + plotHeight - barHeight;
            return (
              <rect
                key={s.key}
                className="chart__bar"
                x={x}
                y={y}
                width={Math.max(1, barWidth - 2)}
                height={Math.max(0, barHeight)}
                rx="2"
                fill={s.color}
              >
                <title>{`${datum.label || ''} — ${s.label}: ${valueFormatter(value)}`}</title>
              </rect>
            );
          });
        })}

        {data.map((datum, index) => {
          const groupX = padding.left + index * groupWidth;
          // Skip every other label when the bars get too dense to read.
          const stride = data.length > 12 ? Math.ceil(data.length / 8) : 1;
          if (index % stride !== 0) return null;
          return (
            <text
              key={`label-${datum.key ?? index}`}
              className="chart__axis-label"
              x={groupX + groupWidth / 2}
              y={height - 24}
              textAnchor="middle"
            >
              {datum.label}
            </text>
          );
        })}
      </svg>
      {series.length > 1 && (
        <ul className="chart__legend">
          {series.map((s) => (
            <li className="chart__legend-item" key={s.key}>
              <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Line chart with an optional area fill, used for the overdue trend. */
export function LineChart({
  data = [],
  series = [{ key: 'value', label: 'Value', color: 'var(--primary)' }],
  height = 220,
  valueFormatter = shortNumber,
  caption,
  xKey = 'label',
  emptyMessage = 'No data for this period',
}) {
  const titleId = useId();
  if (data.length < 2) {
    return <p className="chart-empty">{data.length ? 'Not enough data points to plot a trend' : emptyMessage}</p>;
  }

  const width = 720;
  const padding = { top: 16, right: 12, bottom: 44, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap((datum) => series.map((s) => Number(datum[s.key]) || 0));
  const max = niceMax(Math.max(1, ...allValues));
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const xAt = (index) => padding.left + index * stepX;
  const yAt = (value) => padding.top + plotHeight - (value / max) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const stride = Math.ceil(data.length / 10);

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${caption || 'Line chart'}: ${data.length} points`}
      >
        {ticks.map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line className="chart__gridline" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="chart__axis-label" x={padding.left - 8} y={y + 4} textAnchor="end">
                {valueFormatter(tick)}
              </text>
            </g>
          );
        })}

        {series.map((s) => {
          const points = data.map((datum, index) => {
            const value = Number(datum[s.key]) || 0;
            return `${xAt(index)},${yAt(value)}`;
          });
          const area = [
            `${xAt(0)},${padding.top + plotHeight}`,
            ...points,
            `${xAt(data.length - 1)},${padding.top + plotHeight}`,
          ].join(' ');
          return (
            <g key={s.key}>
              <polygon className="chart__area" points={area} fill={s.color} />
              <polyline className="chart__line" points={points.join(' ')} stroke={s.color} />
              {data.map((datum, index) => (
                <circle
                  key={`${s.key}-${index}`}
                  className="chart__point"
                  cx={xAt(index)}
                  cy={yAt(Number(datum[s.key]) || 0)}
                  r="3"
                  fill={s.color}
                >
                  <title>{`${datum[xKey] || ''} — ${s.label}: ${valueFormatter(datum[s.key])}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {data.map((datum, index) => {
          if (index % stride !== 0 && index !== data.length - 1) return null;
          return (
            <text
              key={`x-${datum[xKey] ?? index}`}
              className="chart__axis-label"
              x={xAt(index)}
              y={height - 24}
              textAnchor="middle"
            >
              {datum[xKey]}
            </text>
          );
        })}
      </svg>
      {series.length > 1 && (
        <ul className="chart__legend">
          {series.map((s) => (
            <li className="chart__legend-item" key={s.key}>
              <span className="chart__swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Donut chart for part-to-whole breakdowns. */
export function DonutChart({
  data = [],
  size = 180,
  valueFormatter = shortNumber,
  caption,
  centerLabel,
  centerValue,
}) {
  const titleId = useId();
  const total = data.reduce((sum, slice) => sum + (Number(slice.value) || 0), 0);
  if (!data.length || total <= 0) {
    return <p className="chart-empty">No data for this period</p>;
  }

  const radius = size / 2;
  const thickness = size * 0.22;
  const inner = radius - thickness;

  let angle = -Math.PI / 2;
  const arcs = data.map((slice) => {
    const fraction = (Number(slice.value) || 0) / total;
    const sweep = fraction * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const largeArc = sweep > Math.PI ? 1 : 0;
    const x1 = radius + radius * Math.cos(start);
    const y1 = radius + radius * Math.sin(start);
    const x2 = radius + radius * Math.cos(end);
    const y2 = radius + radius * Math.sin(end);
    const x3 = radius + inner * Math.cos(end);
    const y3 = radius + inner * Math.sin(end);
    const x4 = radius + inner * Math.cos(start);
    const y4 = radius + inner * Math.sin(start);
    return {
      ...slice,
      fraction,
      path: `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${largeArc} 0 ${x4} ${y4} Z`,
    };
  });

  return (
    <figure className="chart chart--donut" aria-labelledby={titleId}>
      <svg
        className="chart__svg chart__svg--donut"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${caption || 'Donut chart'}: ${arcs.map((a) => `${a.label} ${(a.fraction * 100).toFixed(1)}%`).join(', ')}`}
      >
        {arcs.map((arc) => (
          <path key={arc.label} className="chart__slice" d={arc.path} fill={arc.color}>
            <title>{`${arc.label}: ${valueFormatter(arc.value)} (${(arc.fraction * 100).toFixed(1)}%)`}</title>
          </path>
        ))}
        {(centerLabel || centerValue) && (
          <>
            <text className="chart__center-value" x={radius} y={radius - 2} textAnchor="middle">
              {centerValue ?? valueFormatter(total)}
            </text>
            {centerLabel && (
              <text className="chart__center-label" x={radius} y={radius + 16} textAnchor="middle">
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>
      <ul className="chart__legend chart__legend--stacked">
        {arcs.map((arc) => (
          <li className="chart__legend-item" key={arc.label}>
            <span className="chart__swatch" style={{ background: arc.color }} aria-hidden="true" />
            <span className="chart__legend-label">{arc.label}</span>
            <span className="chart__legend-value">{valueFormatter(arc.value)}</span>
            <span className="chart__legend-share">{(arc.fraction * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Labelled progress meter, used for completion and time-utilisation rates. */
export function Meter({ label, value, max = 100, display, tone = 'primary', hint }) {
  const percent = Math.max(0, Math.min(100, max > 0 ? (Number(value) / max) * 100 : 0));
  return (
    <div className="meter">
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        <span className="meter__value">{display ?? `${percent.toFixed(1)}%`}</span>
      </div>
      <div
        className="meter__track"
        role="progressbar"
        aria-valuenow={Number(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className={`meter__fill meter__fill--${tone}`} style={{ width: `${percent}%` }} />
      </div>
      {hint && <p className="meter__hint">{hint}</p>}
    </div>
  );
}
