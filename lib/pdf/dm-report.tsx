/**
 * Template PDF para Reporte de Doble Materialidad IA.
 * Renderizado server-side con @react-pdf/renderer.
 * Secciones: Portada · Resumen Ejecutivo · Prioridades · Benchmark · Riesgos · Recomendaciones · Próximos Pasos
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Svg, Rect, Line, Circle, G } from "@react-pdf/renderer";
import type { Client } from "@/lib/clients";
import type { BenchmarkField } from "@/lib/dm/fields";

// ── Tipos ────────────────────────────────────────────────────
export type PriorityTopic = {
  tema: string;
  score_financiero: number;
  score_impacto: number;
  prioridad: "alta" | "media" | "baja";
  accion_clave: string;
};

export type BenchmarkGap = {
  dimension: string;
  nivel_cliente: "Básico" | "Intermedio" | "Avanzado" | "Líder";
  nivel_sector: "Básico" | "Intermedio" | "Avanzado" | "Líder";
  brecha: "alta" | "media" | "baja" | "ninguna";
};

export type ProximoPaso = {
  servicio: string;
  descripcion: string;
  plazo: "90 días" | "6 meses" | "12 meses";
  tipo: "diagnóstico" | "implementación" | "certificación" | "reporte";
};

export type RoadmapItem = {
  fase: "0-30d" | "30-60d" | "60-90d";
  actividad: string;
  iro_refs: string;
  prioridad: "alta" | "media" | "baja";
};

export type ReportNarrative = {
  executive_summary: string;
  client_position: string;
  risks: Array<{ title: string; description: string; severity: "alta" | "media" | "baja" }>;
  strengths: string[];
  improvement_areas: string[];
  recommendations: Array<{ action: string; priority: "inmediata" | "corto_plazo" | "mediano_plazo" }>;
  // Campos extendidos para visualizaciones
  priority_topics?: PriorityTopic[];
  benchmark_gaps?: BenchmarkGap[];
  proximos_pasos?: ProximoPaso[];
  roadmap_90d?: RoadmapItem[];
};

export type IroInventoryPdfItem = {
  n_iro: number;
  tema_esg: string;
  descripcion: string;
  tipo: "impacto_positivo" | "impacto_negativo" | "riesgo" | "oportunidad";
  cadena: "upstream" | "ops_propia" | "downstream";
  horizonte: "corto" | "mediano" | "largo";
  evidencia?: string | null;
  score_impacto: number | null;
  score_financiero: number | null;
  confianza: "alto" | "medio" | "bajo";
};

export type NisBrechasPdfItem = {
  ibso_label: string;
  categoria: "ambiental" | "social" | "gobernanza";
  estado: "no_identificado" | "parcial" | "disponible";
  calidad_dato: "baja" | "media" | "alta";
  accion: string | null;
};

export type DmReportData = {
  client: Client;
  narrative: ReportNarrative;
  companies: Array<{ name: string; country: string | null; relation: string }>;
  fields: BenchmarkField[];
  comparison: Record<string, Record<string, string>>;
  generatedAt: string;
  iros?: IroInventoryPdfItem[];
  nisBrechas?: NisBrechasPdfItem[];
};

// ── Colores brand (hex — no Tailwind) ───────────────────────
const C = {
  teal:        "#0d9488",
  tealDark:    "#115e59",
  tealLight:   "#ccfbf1",
  slate900:    "#0f172a",
  slate700:    "#334155",
  slate600:    "#475569",
  slate500:    "#64748b",
  slate400:    "#94a3b8",
  slate300:    "#cbd5e1",
  slate200:    "#e2e8f0",
  slate100:    "#f1f5f9",
  slate50:     "#f8fafc",
  white:       "#ffffff",
  rose:        "#f43f5e",
  roseLight:   "#ffe4e6",
  amber:       "#f59e0b",
  amberLight:  "#fef3c7",
  amberDark:   "#92400e",
  emerald:     "#059669",
  emeraldLight:"#d1fae5",
};

const LEVEL_VALUE: Record<string, number> = {
  "Básico": 1, "Intermedio": 2, "Avanzado": 3, "Líder": 4,
};

const SEVERITY_COLORS: Record<"alta" | "media" | "baja", { bg: string; text: string; border: string }> = {
  alta:  { bg: C.roseLight,    text: C.rose,    border: C.rose },
  media: { bg: C.amberLight,   text: C.amber,   border: C.amber },
  baja:  { bg: C.emeraldLight, text: C.emerald, border: C.emerald },
};

const PRIORITY_LABEL: Record<"inmediata" | "corto_plazo" | "mediano_plazo", string> = {
  inmediata:     "INMEDIATA",
  corto_plazo:   "CORTO PLAZO",
  mediano_plazo: "MEDIANO PLAZO",
};

const PRIORITY_COLOR: Record<"inmediata" | "corto_plazo" | "mediano_plazo", string> = {
  inmediata:     C.rose,
  corto_plazo:   C.amber,
  mediano_plazo: C.teal,
};

const TIPO_COLOR: Record<ProximoPaso["tipo"], string> = {
  "diagnóstico":    C.teal,
  "implementación": C.amber,
  "certificación":  C.emerald,
  "reporte":        C.slate600,
};

const PLAZO_ORDER: Record<string, number> = { "90 días": 0, "6 meses": 1, "12 meses": 2 };

// ── Estilos ──────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: C.white,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 9,
    color: C.slate700,
    lineHeight: 1.5,
  },
  coverPage: {
    fontFamily: "Helvetica",
    backgroundColor: C.tealDark,
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 60,
    color: C.white,
  },
  coverLabel:      { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 3, color: C.tealLight, marginBottom: 32, textTransform: "uppercase" },
  coverTitle:      { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: C.tealLight, textTransform: "uppercase", marginBottom: 12 },
  coverClientName: { fontSize: 28, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 16, lineHeight: 1.2 },
  coverSubtitle:   { fontSize: 11, color: C.tealLight, marginBottom: 6 },
  coverDate:       { position: "absolute", bottom: 48, left: 60, fontSize: 8, color: C.tealLight },
  section:         { marginBottom: 20 },
  sectionTitle: {
    fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    letterSpacing: 2, color: C.teal, marginBottom: 8, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: C.tealLight,
  },
  body:     { fontSize: 9, color: C.slate700, lineHeight: 1.6 },
  riskCard: { marginBottom: 8, padding: 8, backgroundColor: C.slate50, borderLeftWidth: 3, borderLeftColor: C.rose },
  riskCardMedia: { borderLeftColor: C.amber },
  riskCardBaja:  { borderLeftColor: C.emerald },
  riskTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.slate900, marginBottom: 3 },
  riskBody:  { fontSize: 8.5, color: C.slate700, lineHeight: 1.5 },
  severityBadge: {
    fontSize: 6, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    letterSpacing: 1, paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 2, marginBottom: 4, alignSelf: "flex-start",
  },
  bullet:     { marginBottom: 4, flexDirection: "row", gap: 4 },
  bulletDot:  { fontSize: 9, color: C.teal, width: 8 },
  bulletText: { flex: 1, fontSize: 9, color: C.slate700, lineHeight: 1.5 },
  recoRow: { marginBottom: 6, padding: 8, backgroundColor: C.slate50, borderLeftWidth: 2, borderLeftColor: C.teal },
  recoLabel: { fontSize: 6, fontFamily: "Helvetica-Bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
  recoText:  { fontSize: 8.5, color: C.slate700, lineHeight: 1.5 },
  tableWrapper:  { marginTop: 8 },
  tableHeader:   { flexDirection: "row", backgroundColor: C.slate100, borderBottomWidth: 1, borderBottomColor: C.slate300 },
  tableRow:      { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.slate100, paddingVertical: 4 },
  tableRowAlt:   { backgroundColor: C.slate50 },
  thCell: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: C.slate500, paddingHorizontal: 5, paddingVertical: 4 },
  tdCell: { fontSize: 7.5, color: C.slate700, paddingHorizontal: 5, lineHeight: 1.4 },
  footer:      { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText:  { fontSize: 7, color: C.slate500 },
  pageNumber:  { fontSize: 7, color: C.slate500 },
  // Próximos pasos
  pasoCard: { marginBottom: 8, padding: 10, backgroundColor: C.slate50, borderLeftWidth: 3, flexDirection: "row", gap: 8 },
  pasoLeft:  { flex: 1 },
  pasoRight: { alignItems: "flex-end", justifyContent: "flex-start" },
  pasoServicio: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.slate900, marginBottom: 3 },
  pasoDesc:     { fontSize: 8, color: C.slate700, lineHeight: 1.4 },
  plazoBadge: { fontSize: 7, fontFamily: "Helvetica-Bold", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  tipoBadge:  { fontSize: 6, color: C.slate500, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 },
  // IRO / NIS tables
  iroTh:    { fontSize: 6, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: C.slate500, paddingHorizontal: 4, paddingVertical: 3 },
  iroTd:    { fontSize: 7, color: C.slate700, paddingHorizontal: 4, paddingVertical: 3, lineHeight: 1.35 },
  tipoBadgePdf: { fontSize: 6, fontFamily: "Helvetica-Bold", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, alignSelf: "flex-start" },
  scoreDot: { width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  // CTA box
  ctaBox: { marginTop: 16, padding: 14, backgroundColor: C.tealLight, borderRadius: 4, borderLeftWidth: 4, borderLeftColor: C.teal },
  ctaTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.tealDark, marginBottom: 6 },
  ctaBody:  { fontSize: 8.5, color: C.tealDark, lineHeight: 1.5 },
  ctaEmail: { fontSize: 8, color: C.teal, marginTop: 6, fontFamily: "Helvetica-Bold" },
});

// ── Componentes auxiliares ───────────────────────────────────

function Footer({ clientName }: { clientName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Reporte de Doble Materialidad — {clientName} · ResponSable</Text>
      <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

function RiskCard({ risk }: { risk: ReportNarrative["risks"][0] }) {
  const colors = SEVERITY_COLORS[risk.severity];
  const cardStyle = risk.severity === "media"
    ? [s.riskCard, s.riskCardMedia]
    : risk.severity === "baja" ? [s.riskCard, s.riskCardBaja] : [s.riskCard];
  return (
    <View style={cardStyle}>
      <View style={[s.severityBadge, { backgroundColor: colors.bg, color: colors.text }]}>
        <Text>{risk.severity.toUpperCase()}</Text>
      </View>
      <Text style={s.riskTitle}>{risk.title}</Text>
      <Text style={s.riskBody}>{risk.description}</Text>
    </View>
  );
}

// ── Chart: Tabla de temas prioritarios ──────────────────────

function PriorityTopicsTable({ topics }: { topics: PriorityTopic[] }) {
  const sorted = [...topics].sort((a, b) =>
    (b.score_financiero + b.score_impacto) - (a.score_financiero + a.score_impacto)
  );
  return (
    <View style={s.tableWrapper}>
      <View style={s.tableHeader}>
        <Text style={[s.thCell, { width: "35%" }]}>Tema Material</Text>
        <Text style={[s.thCell, { width: "12%", textAlign: "center" }]}>Score Fin.</Text>
        <Text style={[s.thCell, { width: "12%", textAlign: "center" }]}>Score Imp.</Text>
        <Text style={[s.thCell, { width: "12%", textAlign: "center" }]}>Prioridad</Text>
        <Text style={[s.thCell, { flex: 1 }]}>Acción Clave</Text>
      </View>
      {sorted.map((t, i) => {
        const colors = SEVERITY_COLORS[t.prioridad];
        return (
          <View key={i} style={i % 2 === 1 ? [s.tableRow, s.tableRowAlt] : s.tableRow}>
            <Text style={[s.tdCell, { width: "35%", fontFamily: "Helvetica-Bold" }]}>{t.tema}</Text>
            <Text style={[s.tdCell, { width: "12%", textAlign: "center" }]}>{t.score_financiero.toFixed(1)}</Text>
            <Text style={[s.tdCell, { width: "12%", textAlign: "center" }]}>{t.score_impacto.toFixed(1)}</Text>
            <View style={[{ width: "12%", paddingHorizontal: 5, justifyContent: "center" }]}>
              <View style={[s.severityBadge, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}>
                <Text>{t.prioridad.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={[s.tdCell, { flex: 1 }]}>{t.accion_clave}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Chart: Barras de brechas vs sector ──────────────────────
// Horizontal bars — cliente (teal) vs sector (slate) por dimensión

function BenchmarkGapChart({ gaps }: { gaps: BenchmarkGap[] }) {
  const BAR_MAX_W = 200;
  const BAR_H     = 8;
  const ROW_H     = 26;
  const LABEL_W   = 140;
  const chartH    = gaps.length * ROW_H + 28; // +28 para leyenda

  const levelPct = (level: string) => (LEVEL_VALUE[level] ?? 1) / 4;
  const levelLabel = (level: string) => level;

  const brechaColor: Record<string, string> = {
    alta: C.rose, media: C.amber, baja: C.amber, ninguna: C.emerald,
  };

  return (
    <View>
      <Svg width={LABEL_W + BAR_MAX_W + 60} height={chartH}>
        {/* Eje nivel labels */}
        {["Básico", "Intermedio", "Avanzado", "Líder"].map((lv, li) => (
          <G key={lv}>
            <Line
              x1={LABEL_W + (li / 3) * BAR_MAX_W}
              y1={0}
              x2={LABEL_W + (li / 3) * BAR_MAX_W}
              y2={chartH - 22}
              stroke={C.slate200}
              strokeWidth={0.5}
              strokeDasharray="2,2"
            />
            <Text
              x={LABEL_W + (li / 3) * BAR_MAX_W}
              y={chartH - 12}
              style={{ fontSize: 5.5, fill: C.slate400 }}
              textAnchor="middle"
            >
              {lv}
            </Text>
          </G>
        ))}
        {gaps.map((g, i) => {
          const y      = i * ROW_H + 4;
          const cliW   = levelPct(g.nivel_cliente) * BAR_MAX_W;
          const secW   = levelPct(g.nivel_sector) * BAR_MAX_W;
          const color  = brechaColor[g.brecha] ?? C.slate400;

          return (
            <G key={i}>
              {/* Label */}
              <Text x={0} y={y + BAR_H - 1} style={{ fontSize: 7, fill: C.slate700, fontFamily: "Helvetica" }}>
                {g.dimension.length > 22 ? g.dimension.slice(0, 20) + "…" : g.dimension}
              </Text>
              {/* Fondo track */}
              <Rect x={LABEL_W} y={y} width={BAR_MAX_W} height={BAR_H} fill={C.slate100} />
              {/* Barra sector (gris — referencia) */}
              <Rect x={LABEL_W} y={y} width={secW} height={BAR_H} fill={C.slate300} />
              {/* Barra cliente (colored — comparación) */}
              <Rect x={LABEL_W} y={y + 1} width={cliW} height={BAR_H - 2} fill={cliW >= secW ? C.teal : color} />
              {/* Etiqueta nivel cliente */}
              <Text
                x={LABEL_W + cliW + 3}
                y={y + BAR_H - 1}
                style={{ fontSize: 6, fill: cliW >= secW ? C.teal : color, fontFamily: "Helvetica-Bold" }}
              >
                {levelLabel(g.nivel_cliente)}
              </Text>
            </G>
          );
        })}
      </Svg>
      {/* Leyenda */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View style={{ width: 10, height: 6, backgroundColor: C.teal }} />
          <Text style={{ fontSize: 6.5, color: C.slate600 }}>Nivel del cliente</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View style={{ width: 10, height: 6, backgroundColor: C.slate300 }} />
          <Text style={{ fontSize: 6.5, color: C.slate600 }}>Promedio sector benchmark</Text>
        </View>
      </View>
    </View>
  );
}

// ── Chart: Scatter de materialidad (simple versión PDF) ──────
// Cuadrante 2x2 con puntos posicionados por score financiero vs impacto

function MaterialityScatterChart({ topics }: { topics: PriorityTopic[] }) {
  const W = 280, H = 180;
  const PAD = 28;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  const prioColor: Record<string, string> = {
    alta: C.rose, media: C.amber, baja: C.teal,
  };

  return (
    <View>
      <Svg width={W} height={H}>
        {/* Fondo cuadrantes */}
        <Rect x={PAD + plotW / 2} y={PAD} width={plotW / 2} height={plotH / 2} fill="#fff7ed" />
        <Rect x={PAD} y={PAD + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#f0fdf4" />
        <Rect x={PAD + plotW / 2} y={PAD + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#fef3c7" />

        {/* Grid lines */}
        <Line x1={PAD} y1={PAD + plotH / 2} x2={PAD + plotW} y2={PAD + plotH / 2} stroke={C.slate300} strokeWidth={0.5} strokeDasharray="3,3" />
        <Line x1={PAD + plotW / 2} y1={PAD} x2={PAD + plotW / 2} y2={PAD + plotH} stroke={C.slate300} strokeWidth={0.5} strokeDasharray="3,3" />

        {/* Ejes */}
        <Line x1={PAD} y1={PAD} x2={PAD} y2={PAD + plotH} stroke={C.slate400} strokeWidth={0.75} />
        <Line x1={PAD} y1={PAD + plotH} x2={PAD + plotW} y2={PAD + plotH} stroke={C.slate400} strokeWidth={0.75} />

        {/* Labels ejes */}
        <Text x={PAD + plotW / 2} y={H - 4} style={{ fontSize: 6, fill: C.slate500, fontFamily: "Helvetica-Bold" }} textAnchor="middle">
          Materialidad Financiera →
        </Text>
        <Text x={8} y={PAD + plotH / 2} style={{ fontSize: 6, fill: C.slate500, fontFamily: "Helvetica-Bold" }} textAnchor="middle"
          transform={`rotate(-90, 8, ${PAD + plotH / 2})`}>
          Impacto →
        </Text>

        {/* Etiquetas cuadrantes */}
        <Text x={PAD + plotW * 0.75} y={PAD + 9} style={{ fontSize: 5.5, fill: "#ea580c", fontFamily: "Helvetica-Bold" }} textAnchor="middle">DOBLE MATERIAL</Text>
        <Text x={PAD + plotW * 0.25} y={PAD + 9} style={{ fontSize: 5.5, fill: C.emerald }} textAnchor="middle">IMPACTO</Text>
        <Text x={PAD + plotW * 0.75} y={PAD + plotH - 6} style={{ fontSize: 5.5, fill: C.amber }} textAnchor="middle">FINANCIERO</Text>

        {/* Puntos de temas */}
        {topics.map((t, i) => {
          // score 1-10 → posición en plot
          const x = PAD + ((t.score_financiero - 1) / 9) * plotW;
          const y = PAD + plotH - ((t.score_impacto - 1) / 9) * plotH;
          const color = prioColor[t.prioridad] ?? C.slate500;
          const r = t.prioridad === "alta" ? 4 : t.prioridad === "media" ? 3 : 2.5;
          return (
            <G key={i}>
              <Circle cx={x} cy={y} r={r} fill={color} fillOpacity={0.85} />
              <Text x={x + r + 2} y={y + 2} style={{ fontSize: 5, fill: C.slate700 }}>
                {i + 1}
              </Text>
            </G>
          );
        })}
      </Svg>

      {/* Índice numerado de temas */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
        {topics.map((t, i) => {
          const color = prioColor[t.prioridad] ?? C.slate500;
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 2, width: "48%" }}>
              <View style={{ width: 12, height: 12, backgroundColor: color, borderRadius: 6, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 6, color: C.white, fontFamily: "Helvetica-Bold" }}>{i + 1}</Text>
              </View>
              <Text style={{ fontSize: 7, color: C.slate700, flex: 1 }}>{t.tema.length > 30 ? t.tema.slice(0, 28) + "…" : t.tema}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Sección Próximos Pasos ───────────────────────────────────

function ProximosPasosSection({ pasos }: { pasos: ProximoPaso[] }) {
  const sorted = [...pasos].sort((a, b) => (PLAZO_ORDER[a.plazo] ?? 0) - (PLAZO_ORDER[b.plazo] ?? 0));

  const plazoBg: Record<string, { bg: string; text: string }> = {
    "90 días":  { bg: C.roseLight,    text: C.rose },
    "6 meses":  { bg: C.amberLight,   text: C.amberDark },
    "12 meses": { bg: C.tealLight,    text: C.tealDark },
  };

  return (
    <View>
      {sorted.map((p, i) => {
        const borderColor = TIPO_COLOR[p.tipo] ?? C.slate400;
        const plazoCols   = plazoBg[p.plazo] ?? { bg: C.slate100, text: C.slate700 };
        return (
          <View key={i} style={[s.pasoCard, { borderLeftColor: borderColor }]}>
            <View style={s.pasoLeft}>
              <Text style={s.pasoServicio}>{p.servicio}</Text>
              <Text style={s.pasoDesc}>{p.descripcion}</Text>
              <Text style={s.tipoBadge}>{p.tipo.toUpperCase()}</Text>
            </View>
            <View style={s.pasoRight}>
              <View style={[s.plazoBadge, { backgroundColor: plazoCols.bg, color: plazoCols.text }]}>
                <Text>{p.plazo}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── CTA ResponSable ──────────────────────────────────────────

function ResponsableCta({ clientName }: { clientName: string }) {
  return (
    <View style={s.ctaBox}>
      <Text style={s.ctaTitle}>¿Cómo te acompaña ResponSable?</Text>
      <Text style={s.ctaBody}>
        Los próximos pasos descritos en este reporte son servicios que ResponSable puede implementar contigo.
        Desde diagnósticos de gobierno ESG hasta preparación para certificación ESR CEMEFI o reporte GRI —
        tu consultor ya conoce el contexto de {clientName} y puede arrancar de inmediato.
      </Text>
      <Text style={[s.ctaBody, { marginTop: 6 }]}>
        Para discutir la Prioridad 1, agenda una llamada de 30 minutos con tu consultor ResponSable.
      </Text>
      <Text style={s.ctaEmail}>contacto@responsable.net  ·  www.responsable.net</Text>
    </View>
  );
}

// ── Helpers IRO / NIS ────────────────────────────────────────

const TIPO_PDF: Record<string, { label: string; bg: string; text: string }> = {
  impacto_positivo: { label: "Imp+",   bg: "#d1fae5", text: "#065f46" },
  impacto_negativo: { label: "Imp−",   bg: "#fee2e2", text: "#991b1b" },
  riesgo:           { label: "Riesgo", bg: "#fef3c7", text: "#92400e" },
  oportunidad:      { label: "Opor.",  bg: "#ccfbf1", text: "#115e59" },
};

const CADENA_PDF: Record<string, string> = {
  upstream:   "Upstream",
  ops_propia: "Operación",
  downstream: "Downstream",
};

const ESTADO_PDF: Record<string, { label: string; bg: string; text: string }> = {
  no_identificado: { label: "No identificado", bg: C.slate100,    text: C.slate500 },
  parcial:         { label: "Parcial",          bg: "#fef3c7",     text: "#92400e" },
  disponible:      { label: "Disponible",       bg: "#d1fae5",     text: "#065f46" },
};

const CAT_PDF: Record<string, { label: string; bg: string; text: string }> = {
  ambiental:  { label: "Ambiental",  bg: "#ccfbf1", text: "#0f766e" },
  social:     { label: "Social",     bg: "#ede9fe", text: "#5b21b6" },
  gobernanza: { label: "Gobernanza", bg: C.slate100, text: C.slate600 },
};

function scoreColor(v: number | null): string {
  if (v === 3) return C.rose;
  if (v === 2) return C.amber;
  return C.emerald;
}

// ── Inventario IROs ──────────────────────────────────────────

function IroInventorySection({ iros }: { iros: IroInventoryPdfItem[] }) {
  // Agrupar por tema_esg preservando orden de aparición
  const groups: Array<{ tema: string; items: IroInventoryPdfItem[] }> = [];
  for (const iro of iros) {
    const existing = groups.find((g) => g.tema === iro.tema_esg);
    if (existing) existing.items.push(iro);
    else groups.push({ tema: iro.tema_esg, items: [iro] });
  }

  let rowIdx = 0;
  return (
    <View style={s.tableWrapper}>
      {/* Header */}
      <View style={s.tableHeader}>
        <Text style={[s.iroTh, { width: "4%" }]}>#</Text>
        <Text style={[s.iroTh, { flex: 1 }]}>Descripción / Evidencia</Text>
        <Text style={[s.iroTh, { width: "11%", textAlign: "center" }]}>Tipo</Text>
        <Text style={[s.iroTh, { width: "11%", textAlign: "center" }]}>Cadena</Text>
        <Text style={[s.iroTh, { width: "8%",  textAlign: "center" }]}>Horiz.</Text>
        <Text style={[s.iroTh, { width: "6%",  textAlign: "center" }]}>Imp.</Text>
        <Text style={[s.iroTh, { width: "6%",  textAlign: "center" }]}>Fin.</Text>
      </View>

      {groups.map((group) => (
        <View key={group.tema}>
          {/* Cabecera de bloque temático */}
          <View style={{ backgroundColor: C.tealLight, paddingHorizontal: 5, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.teal }}>
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: C.tealDark, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {group.tema}
            </Text>
          </View>

          {group.items.map((iro) => {
            const i = rowIdx++;
            const tipo = TIPO_PDF[iro.tipo];
            const descTrunc = iro.descripcion.length > 130
              ? iro.descripcion.slice(0, 128) + "…"
              : iro.descripcion;
            return (
              <View key={iro.n_iro} style={i % 2 === 1 ? [s.tableRow, s.tableRowAlt] : s.tableRow}>
                <Text style={[s.iroTd, { width: "4%", color: C.slate400 }]}>{iro.n_iro}</Text>
                <View style={[{ flex: 1, paddingHorizontal: 4, paddingVertical: 3 }]}>
                  <Text style={{ fontSize: 7, color: C.slate700, lineHeight: 1.35 }}>{descTrunc}</Text>
                  {iro.evidencia ? (
                    <Text style={{ fontSize: 5.5, color: C.slate400, marginTop: 1 }}>
                      Fuente: {iro.evidencia.length > 70 ? iro.evidencia.slice(0, 68) + "…" : iro.evidencia}
                    </Text>
                  ) : null}
                </View>
                <View style={{ width: "11%", paddingHorizontal: 4, paddingVertical: 3, justifyContent: "flex-start" }}>
                  {tipo ? (
                    <View style={[s.tipoBadgePdf, { backgroundColor: tipo.bg }]}>
                      <Text style={{ color: tipo.text }}>{tipo.label}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[s.iroTd, { width: "11%", textAlign: "center" }]}>
                  {CADENA_PDF[iro.cadena] ?? iro.cadena}
                </Text>
                <Text style={[s.iroTd, { width: "8%", textAlign: "center", textTransform: "capitalize" }]}>
                  {iro.horizonte}
                </Text>
                <Text style={[s.iroTd, { width: "6%", textAlign: "center", color: scoreColor(iro.score_impacto), fontFamily: "Helvetica-Bold" }]}>
                  {iro.score_impacto ?? "—"}
                </Text>
                <Text style={[s.iroTd, { width: "6%", textAlign: "center", color: scoreColor(iro.score_financiero), fontFamily: "Helvetica-Bold" }]}>
                  {iro.score_financiero ?? "—"}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── NIS / IBSO Brechas ───────────────────────────────────────

function NisBrechasSection({ items }: { items: NisBrechasPdfItem[] }) {
  return (
    <View style={s.tableWrapper}>
      <View style={s.tableHeader}>
        <Text style={[s.iroTh, { flex: 1 }]}>Indicador IBSO</Text>
        <Text style={[s.iroTh, { width: "14%", textAlign: "center" }]}>Categoría</Text>
        <Text style={[s.iroTh, { width: "18%", textAlign: "center" }]}>Estado</Text>
        <Text style={[s.iroTh, { width: "12%", textAlign: "center" }]}>Calidad</Text>
        <Text style={[s.iroTh, { width: "28%" }]}>Acción</Text>
      </View>
      {items.map((item, i) => {
        const estado = ESTADO_PDF[item.estado];
        const cat    = CAT_PDF[item.categoria];
        return (
          <View key={i} style={i % 2 === 1 ? [s.tableRow, s.tableRowAlt] : s.tableRow}>
            <Text style={[s.iroTd, { flex: 1, fontFamily: "Helvetica-Bold" }]}>{item.ibso_label}</Text>
            <View style={[{ width: "14%", paddingHorizontal: 4, paddingVertical: 3, justifyContent: "center", alignItems: "center" }]}>
              {cat && (
                <View style={[s.tipoBadgePdf, { backgroundColor: cat.bg }]}>
                  <Text style={{ color: cat.text }}>{cat.label}</Text>
                </View>
              )}
            </View>
            <View style={[{ width: "18%", paddingHorizontal: 4, paddingVertical: 3, justifyContent: "center", alignItems: "center" }]}>
              {estado && (
                <View style={[s.tipoBadgePdf, { backgroundColor: estado.bg }]}>
                  <Text style={{ color: estado.text }}>{estado.label}</Text>
                </View>
              )}
            </View>
            <Text style={[s.iroTd, { width: "12%", textAlign: "center", textTransform: "capitalize" }]}>
              {item.calidad_dato}
            </Text>
            <Text style={[s.iroTd, { width: "28%", color: C.slate500 }]}>
              {item.accion
                ? (item.accion.length > 60 ? item.accion.slice(0, 58) + "…" : item.accion)
                : "—"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Roadmap 90 días ──────────────────────────────────────────

const FASE_COLORS: Record<RoadmapItem["fase"], { bg: string; text: string }> = {
  "0-30d":  { bg: C.roseLight,    text: C.rose },
  "30-60d": { bg: C.amberLight,   text: C.amberDark },
  "60-90d": { bg: C.tealLight,    text: C.tealDark },
};

function Roadmap90DSection({ items }: { items: RoadmapItem[] }) {
  // Agrupar por fase preservando orden
  const phases: Array<RoadmapItem["fase"]> = ["0-30d", "30-60d", "60-90d"];
  const byFase = phases.reduce<Record<string, RoadmapItem[]>>((acc, f) => {
    acc[f] = items.filter((i) => i.fase === f);
    return acc;
  }, {});

  return (
    <View>
      {phases.map((fase) => {
        const faseItems = byFase[fase] ?? [];
        if (faseItems.length === 0) return null;
        const colors = FASE_COLORS[fase];
        return (
          <View key={fase} style={{ marginBottom: 10 }}>
            {/* Fase header */}
            <View style={{ backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 4, borderLeftWidth: 3, borderLeftColor: colors.text, marginBottom: 4 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                {fase} — {fase === "0-30d" ? "Acciones inmediatas" : fase === "30-60d" ? "Consolidación" : "Cierre y entregables"}
              </Text>
            </View>
            {faseItems.map((item, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.slate100, alignItems: "flex-start" }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 8, color: C.slate700, lineHeight: 1.4 }}>{item.actividad}</Text>
                  {item.iro_refs ? (
                    <Text style={{ fontSize: 6, color: C.slate400, marginTop: 1 }}>IROs: {item.iro_refs}</Text>
                  ) : null}
                </View>
                <View style={[s.tipoBadgePdf, { backgroundColor: SEVERITY_COLORS[item.prioridad]?.bg ?? C.slate100, marginTop: 1 }]}>
                  <Text style={{ color: SEVERITY_COLORS[item.prioridad]?.text ?? C.slate600, fontFamily: "Helvetica-Bold" }}>
                    {item.prioridad.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ── Documento principal ──────────────────────────────────────

export function DmReportDocument({ data }: { data: DmReportData }) {
  const { client, narrative, companies, fields, comparison, generatedAt, iros, nisBrechas } = data;
  const companyList = companies.map((c) => c.name).join(", ");
  const hasPriorityTopics = narrative.priority_topics && narrative.priority_topics.length > 0;
  const hasBenchmarkGaps  = narrative.benchmark_gaps && narrative.benchmark_gaps.length > 0;
  const hasProximosPasos  = narrative.proximos_pasos && narrative.proximos_pasos.length > 0;
  const hasIros           = iros && iros.length > 0;
  const hasNis            = nisBrechas && nisBrechas.length > 0;
  const hasRoadmap        = narrative.roadmap_90d && narrative.roadmap_90d.length > 0;

  return (
    <Document>
      {/* ── Portada ─────────────────────────────────────────── */}
      <Page size="A4" style={s.coverPage}>
        <Text style={s.coverLabel}>ResponSable · Consultoría ESG</Text>
        <Text style={s.coverTitle}>Reporte de Doble Materialidad</Text>
        <Text style={s.coverClientName}>{client.name}</Text>
        <Text style={s.coverSubtitle}>
          {client.sector ?? "Sector no especificado"} · {(client.countries as string[] | null)?.join(", ") ?? "México"}
        </Text>
        <Text style={[s.coverSubtitle, { marginTop: 8, fontSize: 9 }]}>
          Benchmark vs: {companyList}
        </Text>
        <Text style={s.coverDate}>Generado: {generatedAt}</Text>
      </Page>

      {/* ── Resumen Ejecutivo ────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <SectionTitle>Resumen Ejecutivo</SectionTitle>
          <Text style={s.body}>{narrative.executive_summary}</Text>
        </View>
        <Footer clientName={client.name} />
      </Page>

      {/* ── Temas Prioritarios + Scatter ────────────────────── */}
      {hasPriorityTopics && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>Análisis de Temas Materiales</SectionTitle>
            <Text style={[s.body, { marginBottom: 10, fontSize: 8, color: C.slate500 }]}>
              Temas ordenados por materialidad combinada (financiero + impacto). Score 1–10.
            </Text>
            <PriorityTopicsTable topics={narrative.priority_topics!} />
          </View>
          <View style={[s.section, { marginTop: 16 }]}>
            <SectionTitle>Matriz de Doble Materialidad</SectionTitle>
            <Text style={[s.body, { marginBottom: 8, fontSize: 8, color: C.slate500 }]}>
              Eje X = Materialidad financiera · Eje Y = Magnitud de impacto en sociedad/ambiente
            </Text>
            <MaterialityScatterChart topics={narrative.priority_topics!} />
          </View>
          <Footer clientName={client.name} />
        </Page>
      )}

      {/* ── Posicionamiento + Brechas ────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <SectionTitle>Posicionamiento vs Grupo de Referencia</SectionTitle>
          <Text style={s.body}>{narrative.client_position}</Text>
        </View>

        {hasBenchmarkGaps && (
          <View style={s.section}>
            <SectionTitle>Brechas por Dimensión ESG</SectionTitle>
            <Text style={[s.body, { marginBottom: 10, fontSize: 8, color: C.slate500 }]}>
              Comparación del nivel actual de {client.name} vs promedio del sector benchmark.
            </Text>
            <BenchmarkGapChart gaps={narrative.benchmark_gaps!} />
          </View>
        )}
        <Footer clientName={client.name} />
      </Page>

      {/* ── Riesgos ──────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <SectionTitle>Riesgos Identificados</SectionTitle>
          {narrative.risks.map((risk, i) => (
            <RiskCard key={i} risk={risk} />
          ))}
        </View>

        <View style={s.section}>
          <SectionTitle>Fortalezas</SectionTitle>
          {narrative.strengths.map((str, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>›</Text>
              <Text style={s.bulletText}>{str}</Text>
            </View>
          ))}
        </View>
        <Footer clientName={client.name} />
      </Page>

      {/* ── Áreas de Mejora + Recomendaciones ───────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <SectionTitle>Áreas de Mejora</SectionTitle>
          {narrative.improvement_areas.map((area, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>›</Text>
              <Text style={s.bulletText}>{area}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <SectionTitle>Recomendaciones</SectionTitle>
          {narrative.recommendations.map((r, i) => (
            <View key={i} style={s.recoRow}>
              <Text style={[s.recoLabel, { color: PRIORITY_COLOR[r.priority] }]}>
                {PRIORITY_LABEL[r.priority]}
              </Text>
              <Text style={s.recoText}>{r.action}</Text>
            </View>
          ))}
        </View>
        <Footer clientName={client.name} />
      </Page>

      {/* ── Roadmap 90 días ──────────────────────────────────── */}
      {hasRoadmap && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>Roadmap 90 Días</SectionTitle>
            <Text style={[s.body, { marginBottom: 10, fontSize: 8, color: C.slate500 }]}>
              Acciones concretas priorizadas para los primeros 90 días, organizadas en tres fases de 30 días.
              Basadas en los IROs de mayor prioridad identificados para {client.name}.
            </Text>
            <Roadmap90DSection items={narrative.roadmap_90d!} />
          </View>
          <Footer clientName={client.name} />
        </Page>
      )}

      {/* ── Inventario IROs ──────────────────────────────────── */}
      {hasIros && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>Inventario Preliminar de IROs</SectionTitle>
            <Text style={[s.body, { marginBottom: 8, fontSize: 8, color: C.slate500 }]}>
              {iros!.length} IROs identificados y revisados por el consultor.
              Imp. = Score impacto sobre sociedad/ambiente (1–3). Fin. = Magnitud financiera potencial (1–3).
            </Text>
            <IroInventorySection iros={iros!} />
          </View>
          <Footer clientName={client.name} />
        </Page>
      )}

      {/* ── NIS / IBSO Brechas ──────────────────────────────── */}
      {hasNis && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>NIS / IBSO — Mapa de Brechas de Información</SectionTitle>
            <Text style={[s.body, { marginBottom: 8, fontSize: 8, color: C.slate500 }]}>
              Indicadores de alto valor (IBSO) identificados para el sector.
              Estado: Disponible = dato existe · Parcial = incompleto · No identificado = por recopilar.
            </Text>
            <NisBrechasSection items={nisBrechas!} />
          </View>
          <Footer clientName={client.name} />
        </Page>
      )}

      {/* ── Próximos Pasos + CTA ─────────────────────────────── */}
      {hasProximosPasos && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>Hoja de Ruta Recomendada</SectionTitle>
            <Text style={[s.body, { marginBottom: 10, fontSize: 8, color: C.slate500 }]}>
              Pasos concretos ordenados por horizonte temporal. Cada paso corresponde a un servicio de acompañamiento.
            </Text>
            <ProximosPasosSection pasos={narrative.proximos_pasos!} />
          </View>
          <ResponsableCta clientName={client.name} />
          <Footer clientName={client.name} />
        </Page>
      )}

      {/* ── Tablas de Benchmark ──────────────────────────────── */}
      {Object.entries(comparison).map(([fieldKey, values], fi) => {
        const field = fields.find((f) => f.key === fieldKey);
        if (!field) return null;
        const entries = Object.entries(values);
        return (
          <Page key={fi} size="A4" style={s.page}>
            <View style={s.section}>
              <SectionTitle>{`Benchmark: ${field.label}`}</SectionTitle>
              {field.description && (
                <Text style={[s.body, { marginBottom: 8, color: C.slate500, fontSize: 8 }]}>
                  {field.description}
                </Text>
              )}
              <View style={s.tableWrapper}>
                <View style={s.tableHeader}>
                  <Text style={[s.thCell, { width: "30%" }]}>Empresa</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Situación</Text>
                </View>
                {entries.map(([company, value], ri) => (
                  <View key={ri} style={ri % 2 === 1 ? [s.tableRow, s.tableRowAlt] : s.tableRow}>
                    <Text style={[s.tdCell, { width: "30%", fontFamily: company === client.name ? "Helvetica-Bold" : "Helvetica" }]}>
                      {company}{company === client.name ? " ★" : ""}
                    </Text>
                    <Text style={[s.tdCell, { flex: 1 }]}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Footer clientName={client.name} />
          </Page>
        );
      })}
    </Document>
  );
}
