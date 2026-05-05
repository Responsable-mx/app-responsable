// Sparkline mínimo SVG sin dependencias. Polyline + área debajo opcional.
// Uso: KPI cards de Uso IA + dashboards futuros. Pattern Tremor/Tailwind UI.

export function Sparkline({
  values,
  width = 80,
  height = 24,
  color = "#0f766e",
  fillOpacity = 0.15,
  strokeWidth = 1.5,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}) {
  if (!values.length) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#cbd5e1" strokeDasharray="2,2" />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Path para área: cierra abajo.
  const areaPath = `M0,${height} L${points.replace(/\s/g, " L")} L${width},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={areaPath} fill={color} fillOpacity={fillOpacity} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
