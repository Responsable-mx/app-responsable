/**
 * Plantilla PDF entregable de cliente.
 * Renderizada server-side con @react-pdf/renderer.
 * Secciones: Portada · Perfil · Contexto · Servicios · Cuestionario · Materialidad.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import type { Client } from "@/lib/clients";
import type { ClientService } from "@/lib/client-services";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";
import type { MaterialityTopic } from "@/lib/materiality/types";
import {
  isWizardSchema,
  isFieldResponse,
  getFieldValue,
  isFieldFilled,
} from "@/lib/questionnaires/types";
import { COLOR_META } from "@/lib/materiality/types";

// ── Colores brand (hex para PDF — no Tailwind) ───────────────
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
  amber:     "#f59e0b",
  emerald:   "#059669",
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

  // Portada
  coverPage: {
    fontFamily: "Helvetica",
    backgroundColor: C.teal,
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 60,
    color: C.white,
  },
  coverLogo: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 3,
    textTransform: "uppercase",
    color: C.tealLight,
    marginBottom: 48,
  },
  coverClientName: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 12,
    lineHeight: 1.2,
  },
  coverMeta: {
    fontSize: 11,
    color: C.tealLight,
    marginBottom: 6,
  },
  coverDate: {
    position: "absolute",
    bottom: 48,
    left: 60,
    fontSize: 9,
    color: C.tealLight,
  },

  // Secciones
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

  // Bloques narrativos
  blockLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.slate900,
    marginBottom: 3,
    marginTop: 10,
  },
  blockText: {
    fontSize: 9,
    color: C.slate700,
    lineHeight: 1.6,
  },

  // Chips / badges
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  chip: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    backgroundColor: C.slate100,
    color: C.slate700,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  chipTeal: {
    backgroundColor: C.tealLight,
    color: C.tealDark,
  },

  // Tabla materialidad
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.slate100,
    paddingVertical: 5,
    alignItems: "flex-start",
  },
  tableHead: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: C.slate500,
    backgroundColor: C.slate50,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableCell: { fontSize: 8, paddingHorizontal: 4 },

  // KV rows
  kvRow: { flexDirection: "row", marginBottom: 3 },
  kvLabel: {
    width: 140,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.slate500,
  },
  kvValue: { flex: 1, fontSize: 8, color: C.slate700 },

  // Cuestionario
  stepTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.slate900,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: C.slate50,
    borderLeftWidth: 3,
    borderLeftColor: C.teal,
  },
  fieldRow: { marginBottom: 5 },
  fieldLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.slate500, marginBottom: 1 },
  fieldValue: { fontSize: 8.5, color: C.slate700, lineHeight: 1.5 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.slate300,
    borderTopWidth: 1,
    borderTopColor: C.slate100,
    paddingTop: 6,
  },
});

// ── Helpers ─────────────────────────────────────────────────

function formatFieldValue(value: ReturnType<typeof getFieldValue>): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function getServiceLabel(service: string): string {
  const map: Record<string, string> = {
    doble_materialidad: "Estudio de Doble Materialidad",
    esr: "Certificación ESR CEMEFI",
    informe_sostenibilidad: "Informe de Sostenibilidad",
  };
  return map[service] ?? service;
}

function renderNarrativeText(text: string | null | undefined): string {
  if (!text || !text.trim()) return "";
  return text.trim();
}

// ── Componentes internos ────────────────────────────────────

function Footer({ clientName }: { clientName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>ResponSable · {clientName}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

function KVRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{value}</Text>
    </View>
  );
}

function ChipList({ items, teal }: { items: string[]; teal?: boolean }) {
  if (!items.length) return null;
  return (
    <View style={s.chipRow}>
      {items.map((item, i) => (
        <Text key={i} style={[s.chip, teal ? s.chipTeal : {}]}>{item}</Text>
      ))}
    </View>
  );
}

// ── Props del componente principal ──────────────────────────

export type ClientReportProps = {
  client: Client;
  services: ClientService[];
  questionnaire: QuestionnaireBundle | null;
  materiality: MaterialityTopic[];
  generatedAt: string; // ISO string
  humanized: {
    sector: string | null;
    size: string | null;
    countries: string[];
    frameworks: string[];
    certifications: string[];
    material_topics: string[];
    services: string[];
    maturity_level: string | null;
  };
};

// ── Documento PDF ────────────────────────────────────────────

export function ClientReport({
  client,
  services,
  questionnaire,
  materiality,
  generatedAt,
  humanized,
}: ClientReportProps) {
  const genDate = new Date(generatedAt).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const NARRATIVE_BLOCKS: Array<{ key: keyof Client; label: string }> = [
    { key: "info_general",           label: "1. Operaciones y productos" },
    { key: "business_model",         label: "2. Modelo de negocio" },
    { key: "impacts",                label: "3. Impactos y riesgos" },
    { key: "regulatory_context",     label: "4. Contexto regulatorio" },
    { key: "sustainability_strategy",label: "5. Estrategia de sostenibilidad" },
    { key: "stakeholders",           label: "6. Stakeholders y partes interesadas" },
  ];

  const filledNarrativeBlocks = NARRATIVE_BLOCKS.filter(
    (b) => renderNarrativeText(client[b.key] as string | null)
  );

  const hasQuestionnaire =
    questionnaire?.response &&
    questionnaire.progress.filledFields > 0 &&
    isWizardSchema(questionnaire.template.schema);

  const hasMateriality = materiality.length > 0;

  return (
    <Document
      title={`${client.name} — Reporte ResponSable`}
      author="ResponSable"
      creator="app.responsable.net"
      producer="@react-pdf/renderer"
    >
      {/* ── Portada ─────────────────────────────────────── */}
      <Page size="A4" style={s.coverPage}>
        <Text style={s.coverLogo}>ResponSable</Text>
        <Text style={s.coverClientName}>{client.name}</Text>

        {humanized.sector && (
          <Text style={s.coverMeta}>{humanized.sector}</Text>
        )}
        {humanized.size && (
          <Text style={s.coverMeta}>{humanized.size}</Text>
        )}
        {humanized.countries.length > 0 && (
          <Text style={s.coverMeta}>{humanized.countries.join(" · ")}</Text>
        )}
        {humanized.services.length > 0 && (
          <Text style={{ ...s.coverMeta, marginTop: 16 }}>
            Servicios: {humanized.services.join(", ")}
          </Text>
        )}

        <Text style={s.coverDate}>Generado el {genDate}</Text>
      </Page>

      {/* ── Perfil + Contexto ────────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Perfil estructurado */}
        <View style={s.section}>
          <SectionTitle>Perfil del cliente</SectionTitle>

          <KVRow label="Sector" value={humanized.sector} />
          <KVRow label="Tamaño" value={humanized.size} />
          <KVRow label="Nivel de madurez" value={humanized.maturity_level} />
          <KVRow
            label="Doble materialidad"
            value={client.has_double_materiality ? "Sí" : "No"}
          />
          <KVRow
            label="Informe de sostenibilidad"
            value={client.has_sustainability_report ? "Sí" : "No"}
          />

          {humanized.countries.length > 0 && (
            <View style={s.kvRow}>
              <Text style={s.kvLabel}>Países de operación</Text>
              <View style={{ flex: 1 }}>
                <ChipList items={humanized.countries} />
              </View>
            </View>
          )}
          {humanized.frameworks.length > 0 && (
            <View style={[s.kvRow, { marginTop: 6 }]}>
              <Text style={s.kvLabel}>Marcos de sostenibilidad</Text>
              <View style={{ flex: 1 }}>
                <ChipList items={humanized.frameworks} teal />
              </View>
            </View>
          )}
          {humanized.certifications.length > 0 && (
            <View style={[s.kvRow, { marginTop: 6 }]}>
              <Text style={s.kvLabel}>Certificaciones</Text>
              <View style={{ flex: 1 }}>
                <ChipList items={humanized.certifications} />
              </View>
            </View>
          )}
          {humanized.material_topics.length > 0 && (
            <View style={[s.kvRow, { marginTop: 6 }]}>
              <Text style={s.kvLabel}>Temas materiales</Text>
              <View style={{ flex: 1 }}>
                <ChipList items={humanized.material_topics} />
              </View>
            </View>
          )}
        </View>

        {/* Contexto narrativo */}
        {filledNarrativeBlocks.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Contexto del cliente</SectionTitle>
            {filledNarrativeBlocks.map((b) => {
              const text = renderNarrativeText(client[b.key] as string | null);
              if (!text) return null;
              return (
                <View key={b.key}>
                  <Text style={s.blockLabel}>{b.label}</Text>
                  <Text style={s.blockText}>{text}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Footer clientName={client.name} />
      </Page>

      {/* ── Servicios ────────────────────────────────────── */}
      {services.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>Servicios contratados</SectionTitle>
            {services.map((svc) => (
              <View key={svc.id} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.slate900, marginBottom: 6 }}>
                  {getServiceLabel(svc.service)}
                </Text>
                {Object.entries(svc.data).map(([k, v]) => {
                  if (v === null || v === undefined || v === "") return null;
                  const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                  const display = Array.isArray(v) ? v.join(", ") : String(v);
                  if (!display) return null;
                  return <KVRow key={k} label={label} value={display} />;
                })}
              </View>
            ))}
          </View>
          <Footer clientName={client.name} />
        </Page>
      )}

      {/* ── Cuestionario ─────────────────────────────────── */}
      {hasQuestionnaire && isWizardSchema(questionnaire!.template.schema) && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>
              {`Cuestionario: ${questionnaire!.template.label}`}
            </SectionTitle>
            <Text style={{ fontSize: 8, color: C.slate500, marginBottom: 10 }}>
              {questionnaire!.progress.filledFields} de{" "}
              {questionnaire!.progress.totalFields} campos completados (
              {questionnaire!.progress.pct}%)
            </Text>

            {questionnaire!.template.schema.steps.map((step) => {
              const responses = questionnaire!.response!.responses;
              const stepResp = (responses[step.key] as Record<string, unknown>) ?? {};
              const filledFields = step.fields.filter((f) => {
                const raw = stepResp[f.key];
                return isFieldFilled(getFieldValue(raw));
              });
              if (!filledFields.length) return null;

              return (
                <View key={step.key}>
                  <Text style={s.stepTitle}>{step.title}</Text>
                  {filledFields.map((f) => {
                    const raw = stepResp[f.key];
                    const value = isFieldResponse(raw) ? raw.value : getFieldValue(raw);
                    const display = formatFieldValue(value);
                    if (!display) return null;
                    return (
                      <View key={f.key} style={s.fieldRow}>
                        <Text style={s.fieldLabel}>{f.label}</Text>
                        <Text style={s.fieldValue}>{display}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
          <Footer clientName={client.name} />
        </Page>
      )}

      {/* ── Materialidad ─────────────────────────────────── */}
      {hasMateriality && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <SectionTitle>Matriz de materialidad</SectionTitle>
            <Text style={{ fontSize: 8, color: C.slate500, marginBottom: 8 }}>
              {materiality.length} temas ·{" "}
              {materiality.filter((t) => t.validated).length} validados
            </Text>

            {/* Leyenda */}
            <View style={[s.chipRow, { marginBottom: 10 }]}>
              {(["rose", "amber", "teal", "slate"] as const).map((color) => (
                <Text key={color} style={s.chip}>
                  {COLOR_META[color].symbol} {COLOR_META[color].label}
                </Text>
              ))}
            </View>

            {/* Cabecera tabla */}
            <View style={{ flexDirection: "row", backgroundColor: C.slate50 }}>
              <Text style={[s.tableHead, { width: 16 }]}>Tipo</Text>
              <Text style={[s.tableHead, { flex: 1 }]}>Tema</Text>
              <Text style={[s.tableHead, { width: 48 }]}>Financiero</Text>
              <Text style={[s.tableHead, { width: 48 }]}>Impacto</Text>
              <Text style={[s.tableHead, { width: 36 }]}>Validado</Text>
            </View>

            {/* Filas ordenadas por color (rose → amber → teal → slate) luego posición */}
            {[...materiality]
              .sort((a, b) => {
                const order = { rose: 0, amber: 1, teal: 2, slate: 3 };
                const diff = order[a.color] - order[b.color];
                if (diff !== 0) return diff;
                return a.position_index - b.position_index;
              })
              .map((topic) => (
                <View key={topic.id} style={s.tableRow}>
                  <Text style={[s.tableCell, { width: 16 }]}>
                    {COLOR_META[topic.color].symbol}
                  </Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{topic.label}</Text>
                  <Text style={[s.tableCell, { width: 48 }]}>
                    {topic.x_pos.toFixed(0)}/100
                  </Text>
                  <Text style={[s.tableCell, { width: 48 }]}>
                    {topic.y_pos.toFixed(0)}/100
                  </Text>
                  <Text style={[s.tableCell, { width: 36, color: topic.validated ? C.emerald : C.slate300 }]}>
                    {topic.validated ? "✓" : "—"}
                  </Text>
                </View>
              ))}
          </View>
          <Footer clientName={client.name} />
        </Page>
      )}
    </Document>
  );
}
