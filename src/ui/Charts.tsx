// Small, dependency-free charts (plain SVG / CSS grid), themed by Telegram's
// colours through CSS variables.

export function Bars({ rows, max }: { rows: Array<{ label: string; value: number; hint?: string }>; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label" title={r.label}>
            {r.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} />
          </span>
          <span className="bar-value">{r.hint ?? r.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function Columns({ values, labels, height = 90 }: { values: number[]; labels: string[]; height?: number }) {
  const max = Math.max(1, ...values);
  const w = 100 / values.length;
  return (
    <div className="columns">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img">
        {values.map((v, i) => {
          const h = (v / max) * (height - 4);
          return <rect key={i} x={i * w + w * 0.12} y={height - h} width={w * 0.76} height={h} rx={0.8} className="col" />;
        })}
      </svg>
      <div className="col-labels">
        {labels.map((l, i) => (
          <span key={i} style={{ width: `${w}%` }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Heatmap({ grid, weekdays }: { grid: number[][]; weekdays: string[] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="heatmap">
      {grid.map((row, d) => (
        <div className="heat-row" key={d}>
          <span className="heat-day">{weekdays[d]}</span>
          {row.map((v, h) => (
            <span key={h} className="heat-cell" title={`${weekdays[d]} ${h}:00 — ${v}`} style={{ opacity: v ? 0.15 + 0.85 * (v / max) : 0.06 }} />
          ))}
        </div>
      ))}
      <div className="heat-row heat-hours">
        <span className="heat-day" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="heat-hour">
            {h % 6 === 0 ? h : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
