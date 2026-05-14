"use client";

export type CompanyScore = {
  name: string;
  sólido: number;
  parcial: number;
  brecha: number;
  isClient: boolean;
};

export type CatScore = {
  cat: string;
  label: string;
  client: number;  // 0-100
  peerAvg: number; // 0-100
};

export type BrechaItem = {
  label: string;
  peerBrechas: number;
  totalPeers: number;
};

function truncate(s: string, maxLen: number) {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

// RankingChart — horizontal stacked bars per company, sorted by sólido desc
const LABEL_W = 104;
const BAR_W = 196;
const PAD_R = 44;
const H_ROW = 22;
const PAD_TOP = 18;
const PAD_BOT = 32;

export function RankingChart({
  companies,
  totalFields,
  peerAvgSolido,
}: {
  companies: CompanyScore[];
  totalFields: number;
  peerAvgSolido: number;
}) {
  if (!companies.length || totalFields === 0) return null;
  const sorted = [...companies].sort((a, b) => b.sólido - a.sólido || a.brecha - b.brecha);
  const svgH = PAD_TOP + sorted.length * H_ROW + PAD_BOT;
  const svgW = LABEL_W + BAR_W + PAD_R;
  const avgX = LABEL_W + (peerAvgSolido / totalFields) * BAR_W;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ fontFamily: "inherit" }}>
      {/* Grid lines + tick labels */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const x = LABEL_W + frac * BAR_W;
        return (
          <g key={frac}>
            <line x1={x} y1={PAD_TOP - 6} x2={x} y2={PAD_TOP + sorted.length * H_ROW} stroke="#e2e8f0" strokeWidth="0.6" />
            <text x={x} y={PAD_TOP - 8} textAnchor="middle" fontSize="7" fill="#94a3b8">
              {Math.round(frac * totalFields)}
            </text>
          </g>
        );
      })}

      {/* Rows */}
      {sorted.map((co, i) => {
        const y = PAD_TOP + i * H_ROW;
        const barY = y + H_ROW * 0.18;
        const barH = H_ROW * 0.62;
        const wSol = (co.sólido / totalFields) * BAR_W;
        const wPar = (co.parcial / totalFields) * BAR_W;
        const wBre = (co.brecha / totalFields) * BAR_W;
        return (
          <g key={co.name}>
            {co.isClient && (
              <rect x={0} y={y} width={svgW - 2} height={H_ROW} fill="#f0fdfa" rx="2" />
            )}
            <text
              x={LABEL_W - 4}
              y={y + H_ROW / 2 + 3.5}
              textAnchor="end"
              fontSize={co.isClient ? "8.5" : "7.5"}
              fontWeight={co.isClient ? "700" : "400"}
              fill={co.isClient ? "#0f766e" : "#475569"}
            >
              {co.name.length > 17 && <title>{co.name}</title>}
              {truncate(co.name, 17)}
            </text>
            {wSol > 0 && <rect x={LABEL_W} y={barY} width={wSol} height={barH} fill="#10b981" rx="1" />}
            {wPar > 0 && <rect x={LABEL_W + wSol} y={barY} width={wPar} height={barH} fill="#f59e0b" rx="1" />}
            {wBre > 0 && <rect x={LABEL_W + wSol + wPar} y={barY} width={wBre} height={barH} fill="#f87171" rx="1" />}
            {wSol > 16 && (
              <text x={LABEL_W + wSol / 2} y={barY + barH / 2 + 3} textAnchor="middle" fontSize="6.5" fill="#fff" fontWeight="600">
                {co.sólido}
              </text>
            )}
            {wBre > 16 && (
              <text x={LABEL_W + wSol + wPar + wBre / 2} y={barY + barH / 2 + 3} textAnchor="middle" fontSize="6.5" fill="#fff" fontWeight="600">
                {co.brecha}
              </text>
            )}
          </g>
        );
      })}

      {/* Peer average dashed line */}
      <line
        x1={avgX} y1={PAD_TOP - 10}
        x2={avgX} y2={PAD_TOP + sorted.length * H_ROW + 4}
        stroke="#6366f1"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      <text x={avgX + 2} y={PAD_TOP + sorted.length * H_ROW + 14} fontSize="6.5" fill="#6366f1">
        media ref.
      </text>

      {/* Legend */}
      {(["sólido", "parcial", "brecha"] as const).map((k, idx) => {
        const colors = { sólido: "#10b981", parcial: "#f59e0b", brecha: "#f87171" };
        return (
          <g key={k} transform={`translate(${LABEL_W + idx * 62}, ${svgH - 10})`}>
            <rect x={0} y={-6} width={8} height={8} fill={colors[k]} rx="1" />
            <text x={11} y={1} fontSize="7" fill="#64748b">{k}</text>
          </g>
        );
      })}
    </svg>
  );
}

// RadarEsgChart — 3-axis spider E/S/G, client (teal) vs peer avg (slate dashed)
const CX = 106, CY = 90, R = 66;
const AXES = [
  { angle: -90, label: "Ambiental", key: "E" },
  { angle: 30,  label: "Social",    key: "S" },
  { angle: 150, label: "Gobernanza", key: "G" },
];

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

export function RadarEsgChart({ catScores }: { catScores: CatScore[] }) {
  if (catScores.length < 3) return null;

  const val = (key: string, field: "client" | "peerAvg") => {
    const found = catScores.find((c) => c.cat === key);
    return found ? Math.min(found[field], 100) / 100 : 0;
  };

  const clientPts = AXES.map(({ angle, key }) => polar(angle, val(key, "client") * R));
  const peerPts   = AXES.map(({ angle, key }) => polar(angle, val(key, "peerAvg") * R));

  const toPath = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg viewBox="0 0 212 168" className="w-full" style={{ fontFamily: "inherit" }}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <polygon
          key={frac}
          points={AXES.map(({ angle }) => {
            const [x, y] = polar(angle, frac * R);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={frac === 1 ? "0.8" : "0.5"}
        />
      ))}
      {/* Axis lines */}
      {AXES.map(({ angle }) => {
        const [x, y] = polar(angle, R);
        return <line key={angle} x1={CX} y1={CY} x2={x} y2={y} stroke="#e2e8f0" strokeWidth="0.5" />;
      })}
      {/* % ticks on E axis */}
      {[25, 50, 75].map((pct) => {
        const [tx, ty] = polar(-90, (pct / 100) * R);
        return (
          <text key={pct} x={tx + 3} y={ty + 4} fontSize="6" fill="#94a3b8">
            {pct}%
          </text>
        );
      })}

      {/* Peer polygon */}
      <path d={toPath(peerPts)} fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 2" />
      {peerPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill="#94a3b8" />)}

      {/* Client polygon */}
      <path d={toPath(clientPts)} fill="#0d9488" fillOpacity="0.15" stroke="#0d9488" strokeWidth="1.5" />
      {clientPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="#0d9488" />)}

      {/* Axis labels */}
      {AXES.map(({ angle, label, key }) => {
        const [lx, ly] = polar(angle, R + 14);
        const cs = catScores.find((c) => c.cat === key);
        return (
          <g key={key}>
            <text x={lx} y={ly} textAnchor="middle" fontSize="8" fontWeight="700" fill="#334155">
              {label}
            </text>
            <text x={lx} y={ly + 9} textAnchor="middle" fontSize="7" fill="#0d9488">
              {cs ? Math.round(cs.client) : 0}%
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform="translate(2, 154)">
        <rect x={0} y={-6} width={8} height={7} fill="#0d9488" fillOpacity="0.55" rx="1" />
        <text x={11} y={1} fontSize="7" fill="#334155">Cliente</text>
      </g>
      <g transform="translate(56, 154)">
        <line x1={0} y1={-2} x2={8} y2={-2} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 2" />
        <text x={11} y={1} fontSize="7" fill="#64748b">Media referencias</text>
      </g>
    </svg>
  );
}

// BrechaUrgencyChart — horizontal bars sorted by urgency (most isolated first)
const BLW = 132;
const BBW = 128;
const BHR = 21;
const BPTOP = 14;
const BPBOT = 24;

function urgencyMeta(peerBrechas: number): { label: string; color: string } {
  if (peerBrechas === 0) return { label: "Solo cliente",  color: "#f43f5e" };
  if (peerBrechas <= 2)  return { label: "Diferencial",   color: "#f97316" };
  if (peerBrechas <= 4)  return { label: "Parcial",       color: "#f59e0b" };
  return                        { label: "Sectorial",     color: "#94a3b8" };
}

export function BrechaUrgencyChart({ items }: { items: BrechaItem[] }) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => a.peerBrechas - b.peerBrechas);
  const svgH = BPTOP + sorted.length * BHR + BPBOT;
  const svgW = BLW + BBW + 80;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ fontFamily: "inherit" }}>
      <text x={BLW + BBW / 2} y={9} textAnchor="middle" fontSize="7" fill="#94a3b8">
        referencias con la misma brecha →
      </text>
      {sorted.map((item, i) => {
        const y = BPTOP + i * BHR;
        const barY = y + BHR * 0.18;
        const barH = BHR * 0.6;
        const isolation = 1 - item.peerBrechas / Math.max(item.totalPeers, 1);
        const barW = Math.max(isolation * BBW, 4);
        const { label, color } = urgencyMeta(item.peerBrechas);
        return (
          <g key={item.label}>
            <text x={BLW - 4} y={y + BHR / 2 + 3.5} textAnchor="end" fontSize="8" fill="#334155">
              {item.label.length > 22 && <title>{item.label}</title>}
              {truncate(item.label, 22)}
            </text>
            <rect x={BLW} y={barY} width={barW} height={barH} fill={color} fillOpacity="0.8" rx="1" />
            <text x={BLW + barW + 4} y={y + BHR / 2 + 3.5} fontSize="7" fill={color}>
              {item.peerBrechas === 0
                ? "Exclusiva — ninguna referencia la reporta"
                : `${label} (${item.peerBrechas}/${item.totalPeers})`}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      {[
        { color: "#f43f5e", label: "Solo cliente = más urgente" },
        { color: "#94a3b8", label: "Sectorial = menos urgente" },
      ].map(({ color, label }, i) => (
        <g key={label} transform={`translate(${BLW + i * 120}, ${svgH - 8})`}>
          <rect x={0} y={-6} width={7} height={7} fill={color} rx="1" />
          <text x={10} y={1} fontSize="6.5" fill="#64748b">{label}</text>
        </g>
      ))}
    </svg>
  );
}
