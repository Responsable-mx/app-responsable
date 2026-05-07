/**
 * Template PDF para Reporte de Doble Materialidad IA.
 * Renderizado server-side con @react-pdf/renderer.
 * Secciones: Portada · Resumen Ejecutivo · Posicionamiento · Riesgos · Fortalezas · Benchmark · Recomendaciones
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Client } from "@/lib/clients";
import type { BenchmarkField } from "@/lib/dm/fields";

// ── Tipos ────────────────────────────────────────────────────
export type ReportNarrative = {
  executive_summary: string;
  client_position: string;
  risks: Array<{ title: string; description: string; severity: "alta" | "media" | "baja" }>;
  strengths: string[];
  improvement_areas: string[];
  recommendations: Array<{ action: string; priority: "inmediata" | "corto_plazo" | "mediano_plazo" }>;
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
  teal:      "#0d9488",
  tealDark:  "#115e59",
  tealLight: "#ccfbf1",
  slate900:  "#0f172a",
  slate700:  "#334155",
  slate500:  "#64748b",
  slate300:  "#cbd5e1",
  slate100:  "#f1f5f9",
  slate50:   "#f8fafc",
  white:     "#ffffff",
  rose:      "#f43f5e",
  roseLight: "#ffe4e6",
  amber:     "#f59e0b",
  amberLight:"#fef3c7",
  emerald:   "#059669",
  emeraldLight: "#d1fae5",
};

const SEVERITY_COLORS: Record<"alta" | "media" | "baja", { bg: string; text: string }> = {
  alta:  { bg: C.roseLight,    text: C.rose },
  media: { bg: C.amberLight,   text: C.amber },
  baja:  { bg: C.emeraldLight, text: C.emerald },
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
  coverLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 3,
    color: C.tealLight,
    marginBottom: 32,
    textTransform: "uppercase",
  },
  coverTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: C.tealLight,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  coverClientName: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 16,
    lineHeight: 1.2,
  },
  coverSubtitle: {
    fontSize: 11,
    color: C.tealLight,
    marginBottom: 6,
  },
  coverDate: {
    position: "absolute",
    bottom: 48,
    left: 60,
    fontSize: 8,
    color: C.tealLight,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: C.teal,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.tealLight,
  },
  body: { fontSize: 9, color: C.slate700, lineHeight: 1.6 },
  riskCard: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: C.slate50,
    borderLeftWidth: 3,
    borderLeftColor: C.rose,
  },
  riskCardMedia: { borderLeftColor: C.amber },
  riskCardBaja:  { borderLeftColor: C.emerald },
  riskTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.slate900,
    marginBottom: 3,
  },
  riskBody: { fontSize: 8.5, color: C.slate700, lineHeight: 1.5 },
  severityBadge: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 2,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  bullet: { marginBottom: 4, flexDirection: "row", gap: 4 },
  bulletDot: { fontSize: 9, color: C.teal, width: 8 },
  bulletText: { flex: 1, fontSize: 9, color: C.slate700, lineHeight: 1.5 },
  recoRow: {
    marginBottom: 6,
    padding: 8,
    backgroundColor: C.slate50,
    borderLeftWidth: 2,
    borderLeftColor: C.teal,
  },
  recoLabel: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  recoText: { fontSize: 8.5, color: C.slate700, lineHeight: 1.5 },
  // Tabla benchmark
  tableWrapper: { marginTop: 8 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.slate100,
    borderBottomWidth: 1,
    borderBottomColor: C.slate300,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.slate100,
    paddingVertical: 4,
  },
  tableRowAlt: { backgroundColor: C.slate50 },
  thCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: C.slate500,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  tdCell: {
    fontSize: 7.5,
    color: C.slate700,
    paddingHorizontal: 5,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: 7, color: C.slate500 },
  pageNumber: { fontSize: 7, color: C.slate500 },
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
    : risk.severity === "baja"
    ? [s.riskCard, s.riskCardBaja]
    : [s.riskCard];

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

// ── Documento principal ──────────────────────────────────────

export function DmReportDocument({ data }: { data: DmReportData }) {
  const { client, narrative, companies, fields, comparison, generatedAt } = data;

  // Agrupar empresas por relación para la portada
  const companyList = companies.map((c) => c.name).join(", ");

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

      {/* ── Posicionamiento + Riesgos ────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <SectionTitle>Posicionamiento vs Grupo de Referencia</SectionTitle>
          <Text style={s.body}>{narrative.client_position}</Text>
        </View>

        <View style={s.section}>
          <SectionTitle>Riesgos Identificados</SectionTitle>
          {narrative.risks.map((risk, i) => (
            <RiskCard key={i} risk={risk} />
          ))}
        </View>
        <Footer clientName={client.name} />
      </Page>

      {/* ── Fortalezas + Áreas de mejora + Recomendaciones ──── */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <SectionTitle>Fortalezas</SectionTitle>
          {narrative.strengths.map((s_, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>›</Text>
              <Text style={s.bulletText}>{s_}</Text>
            </View>
          ))}
        </View>

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
                {/* Header */}
                <View style={s.tableHeader}>
                  <Text style={[s.thCell, { width: "30%" }]}>Empresa</Text>
                  <Text style={[s.thCell, { flex: 1 }]}>Situación</Text>
                </View>
                {/* Rows */}
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
