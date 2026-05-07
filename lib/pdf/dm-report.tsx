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
};

export type DmReportData = {
  client: Client;
  narrative: ReportNarrative;
  companies: Array<{ name: string; country: string | null; relation: string }>;
  fields: BenchmarkField[];
  comparison: Record<string, Record<string, string>>;
  generatedAt: string;
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

// ── Documento principal ──────────────────────────────────────

export function DmReportDocument({ data }: { data: DmReportData }) {
  const { client, narrative, companies, fields, comparison, generatedAt } = data;
  const companyList = companies.map((c) => c.name).join(", ");
  const hasPriorityTopics = narrative.priority_topics && narrative.priority_topics.length > 0;
  const hasBenchmarkGaps  = narrative.benchmark_gaps && narrative.benchmark_gaps.length > 0;
  const hasProximosPasos  = narrative.proximos_pasos && narrative.proximos_pasos.length > 0;

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
