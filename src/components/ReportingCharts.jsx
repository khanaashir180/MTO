function toCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function getMax(values) {
  if (!values.length) return 1;
  return Math.max(...values, 1);
}

function getChartPalette(index) {
  const palettes = [
    ['#0b5cab', '#1b76c4', '#4fa3e6', '#93c5f5', '#d7e9fb'],
    ['#0f766e', '#14b8a6', '#5eead4', '#99f6e4', '#ccfbf1'],
    ['#9a3412', '#ea580c', '#fb923c', '#fdba74', '#fed7aa'],
  ];
  return palettes[index % palettes.length];
}

export function DonutChartCard({ title, data = [], totalLabel = 'Total' }) {
  const safeData = data.filter((item) => Number(item.value || 0) > 0);
  const total = safeData.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const colors = getChartPalette(0);
  let cumulative = 0;

  return (
    <article className="card chart-card chart-card-polished">
      <div className="chart-card-head">
        <div>
          <p className="chart-kicker">Distribution</p>
          <h4>{title}</h4>
        </div>
        <span className="chart-badge">{safeData.length} segments</span>
      </div>
      {total <= 0 ? (
        <p className="chart-empty">No data available</p>
      ) : (
        <div className="chart-layout">
          <svg viewBox="0 0 180 180" className="donut-chart" role="img" aria-label={title}>
            <circle cx="90" cy="90" r="50" fill="none" stroke="#e7f0fb" strokeWidth="20" />
            {safeData.map((slice, index) => {
              const value = Number(slice.value || 0);
              const ratio = value / total;
              const dashArray = `${ratio * 314} 314`;
              const rotate = cumulative * 360 - 90;
              cumulative += ratio;
              return (
                <circle
                  key={slice.label}
                  cx="90"
                  cy="90"
                  r="50"
                  fill="none"
                  stroke={colors[index % colors.length]}
                  strokeWidth="20"
                  strokeDasharray={dashArray}
                  transform={`rotate(${rotate} 90 90)`}
                />
              );
            })}
            <text x="90" y="86" textAnchor="middle" className="donut-total">{total}</text>
            <text x="90" y="104" textAnchor="middle" className="donut-label">{totalLabel}</text>
          </svg>
          <div className="chart-legend">
            {safeData.map((item, index) => (
              <div key={item.label} className="legend-row">
                <span className="legend-dot" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="legend-name">{item.label}</span>
                <span className="legend-value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function BarChartCard({ title, data = [], yLabel = 'Value', format = 'number' }) {
  const safeData = data.filter((item) => Number(item.value || 0) >= 0);
  const maxValue = getMax(safeData.map((item) => Number(item.value || 0)));
  const colors = getChartPalette(1);

  return (
    <article className="card chart-card chart-card-polished">
      <div className="chart-card-head">
        <div>
          <p className="chart-kicker">Comparison</p>
          <h4>{title}</h4>
        </div>
        <span className="chart-badge">{safeData.length} rows</span>
      </div>
      {safeData.length === 0 ? (
        <p className="chart-empty">No data available</p>
      ) : (
        <div className="bar-chart-wrap">
          {safeData.map((item, index) => {
            const value = Number(item.value || 0);
            const pct = Math.max((value / maxValue) * 100, 2);
            return (
              <div key={item.label} className="bar-row">
                <span className="bar-label">{item.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${colors[0]} 0%, ${colors[index % colors.length]} 100%)` }} />
                </div>
                <span className="bar-value">
                  {format === 'currency' ? toCurrency(value) : value}
                </span>
              </div>
            );
          })}
          <p className="chart-axis-label">{yLabel}</p>
        </div>
      )}
    </article>
  );
}

export function LineChartCard({ title, points = [], format = 'currency' }) {
  const values = points.map((point) => Number(point.value || 0));
  const max = getMax(values);
  const min = Math.min(...values, 0);
  const width = 520;
  const height = 180;
  const left = 28;
  const right = width - 14;
  const top = 16;
  const bottom = height - 34;
  const usableWidth = right - left;
  const usableHeight = bottom - top;
  const count = Math.max(points.length - 1, 1);

  const path = points
    .map((point, index) => {
      const x = left + (index / count) * usableWidth;
      const y = bottom - (Number(point.value || 0) / max) * usableHeight;
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
  const areaPath = `${path} L${right} ${bottom} L${left} ${bottom} Z`;

  return (
    <article className="card chart-card chart-card-polished">
      <div className="chart-card-head">
        <div>
          <p className="chart-kicker">Trend</p>
          <h4>{title}</h4>
        </div>
        <span className="chart-badge">
          Peak {format === 'currency' ? toCurrency(max) : max}
        </span>
      </div>
      {points.length === 0 ? (
        <p className="chart-empty">No trend points available</p>
      ) : (
        <div>
          <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" aria-label={title}>
            <line x1={left} y1={bottom} x2={right} y2={bottom} className="line-axis" />
            <line x1={left} y1={top} x2={left} y2={bottom} className="line-axis" />
            <path d={areaPath} className="line-area" />
            <path d={path} className="line-path" />
            {points.map((point, index) => {
              const x = left + (index / count) * usableWidth;
              const y = bottom - (Number(point.value || 0) / max) * usableHeight;
              return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="3.5" className="line-dot" />;
            })}
            {points.map((point, index) => {
              const x = left + (index / count) * usableWidth;
              return (
                <text key={`label-${point.label}-${index}`} x={x} y={height - 12} textAnchor="middle" className="line-x-label">
                  {point.label}
                </text>
              );
            })}
          </svg>
          <div className="line-summary-grid">
            {points.map((point) => (
              <div key={point.label} className="line-summary-pill">
                <strong>{point.label}</strong>
                <span>{format === 'currency' ? toCurrency(point.value) : Number(point.value || 0)}</span>
              </div>
            ))}
          </div>
          <p className="chart-axis-label">Range {format === 'currency' ? `${toCurrency(min)} - ${toCurrency(max)}` : `${min} - ${max}`}</p>
        </div>
      )}
    </article>
  );
}
