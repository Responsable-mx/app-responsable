/**
 * Schemas por tipo de servicio. Client-safe (no 'server-only').
 * Reutiliza el tipo FieldDef de narrative-schemas para aprovechar todos
 * los inputs (catalog_multi, bool_tri, object_list, etc.) con el mismo
 * renderer (StructuredBlockEditor).
 *
 * Principio: los campos aquí son ESPECÍFICOS del entregable. Assets
 * compartidos (stakeholders, KPIs, materialidad general) viven en
 * clients.*_json y los roles IA los reciben aparte.
 */

import type { FieldDef } from "@/lib/clients/narrative-schemas";

export type ServiceKey =
  | "doble_materialidad"
  | "doble_materialidad_ia"
  | "esr"
  | "informe_sostenibilidad";

export type ServiceSchema = {
  key: ServiceKey;
  label: string;
  icon: string;
  color: string;
  description: string;
  summary: (data: Record<string, unknown>) => string; // línea corta para card
  fields: FieldDef[];
};

// ─── 1. Doble materialidad ─────────────────────────────────
const DOBLE_MATERIALIDAD: ServiceSchema = {
  key: "doble_materialidad",
  label: "Doble materialidad",
  icon: "🔵",
  color: "bg-indigo-50 border-indigo-200 text-indigo-900",
  description:
    "Estudio de materialidad simple o doble. Los temas materiales y los stakeholders consultados viven en el contexto del cliente.",
  summary: (d) => {
    const año = d.año_estudio as number | undefined;
    const tipo = d.tipo as string | undefined;
    return [año && `Año ${año}`, tipo].filter(Boolean).join(" · ");
  },
  fields: [
    {
      key: "año_estudio",
      label: "Año del estudio",
      type: { kind: "year" },
    },
    {
      key: "tipo",
      label: "Tipo",
      hint: "Simple (impacto) · Doble (financiera + impacto) · Solo financiera",
      type: {
        kind: "text",
        placeholder: "Simple / Doble / Solo financiera",
      },
    },
    {
      key: "metodologia",
      label: "Metodología aplicada",
      hint: "Encuestas, entrevistas, análisis de prensa, etc.",
      type: { kind: "text", multiline: true },
    },
    {
      key: "marcos_aplicados",
      label: "Marcos aplicados",
      type: { kind: "catalog_multi", category: "frameworks" },
    },
    {
      key: "umbral_priorizacion",
      label: "Umbral de priorización",
      hint: "Ej: 'Media 7/10 en ambos ejes'",
      type: { kind: "text" },
    },
    {
      key: "proximo_refresh",
      label: "Próximo refresh previsto",
      type: { kind: "year" },
    },
    {
      key: "url_estudio",
      label: "URL del estudio (liga o PDF)",
      type: { kind: "text" },
    },
    {
      key: "notas",
      label: "Notas",
      type: { kind: "text", multiline: true },
    },
  ],
};

// ─── 2. ESR (CEMEFI) ───────────────────────────────────────
const ESR: ServiceSchema = {
  key: "esr",
  label: "ESR (CEMEFI)",
  icon: "🟢",
  color: "bg-green-50 border-green-200 text-green-900",
  description:
    "Distintivo Empresa Socialmente Responsable de CEMEFI. 4 subíndices: Calidad de vida, Ética, Vinculación con comunidad, Medio ambiente.",
  summary: (d) => {
    const año = d.año_aplicacion as number | undefined;
    const puntaje = d.puntaje_total as number | undefined;
    return [año && `Año ${año}`, puntaje !== undefined && `${puntaje}/100`]
      .filter(Boolean)
      .join(" · ");
  },
  fields: [
    {
      key: "año_aplicacion",
      label: "Año de aplicación",
      type: { kind: "year" },
    },
    {
      key: "años_consecutivos",
      label: "Años consecutivos obtenidos",
      type: { kind: "number", min: 0, max: 30 },
    },
    {
      key: "puntaje_total",
      label: "Puntaje total",
      type: { kind: "number", min: 0, max: 100, unit: "/100" },
    },
    {
      key: "subindices",
      label: "Subíndices",
      hint: "Los 4 de CEMEFI. Puntaje de cada uno.",
      type: {
        kind: "object_list",
        itemLabel: "subíndice",
        maxItems: 10,
        schema: [
          {
            key: "nombre",
            label: "Subíndice",
            type: {
              kind: "text",
              placeholder:
                "Calidad de vida empresa / Ética / Vinculación con comunidad / Medio ambiente",
            },
          },
          {
            key: "puntaje",
            label: "Puntaje",
            type: { kind: "number", min: 0, max: 100, unit: "/100" },
          },
        ],
      },
    },
    {
      key: "areas_brecha",
      label: "Áreas con brecha",
      hint: "Temas que aparecieron abajo del umbral.",
      type: { kind: "string_list", maxItems: 15 },
    },
    {
      key: "plan_mejora",
      label: "Plan de mejora",
      type: { kind: "text", multiline: true },
    },
    {
      key: "url_constancia",
      label: "URL de la constancia",
      type: { kind: "text" },
    },
    {
      key: "notas",
      label: "Notas",
      type: { kind: "text", multiline: true },
    },
  ],
};

// ─── 3. Informe de sostenibilidad ──────────────────────────
const INFORME_SOSTENIBILIDAD: ServiceSchema = {
  key: "informe_sostenibilidad",
  label: "Informe de sostenibilidad",
  icon: "🟠",
  color: "bg-amber-50 border-amber-200 text-amber-900",
  description:
    "Reporte anual de sostenibilidad. KPIs reportados viven en el contexto del cliente (sustainability_strategy_json.kpis).",
  summary: (d) => {
    const año = d.año_cobertura as number | undefined;
    const marco = d.marco_principal as string | undefined;
    const paginas = d.paginas as number | undefined;
    return [
      año && `Cobertura ${año}`,
      marco && marco.toUpperCase(),
      paginas && `${paginas}p`,
    ]
      .filter(Boolean)
      .join(" · ");
  },
  fields: [
    {
      key: "año_cobertura",
      label: "Año de cobertura",
      type: { kind: "year" },
    },
    {
      key: "marco_principal",
      label: "Marco principal",
      hint: "GRI / SASB / ISSB / CSRD / Integrado / Otro",
      type: { kind: "catalog_single", category: "frameworks" },
    },
    {
      key: "gri_opcion",
      label: "Opción GRI (si aplica)",
      hint: "En conformidad / Con referencia a",
      type: { kind: "text", placeholder: "En conformidad / Con referencia a" },
    },
    {
      key: "paginas",
      label: "Número de páginas",
      type: { kind: "number", min: 0, max: 1000 },
    },
    {
      key: "idiomas",
      label: "Idiomas publicados",
      type: { kind: "string_list", placeholder: "es, en, pt…", maxItems: 5 },
    },
    {
      key: "cobertura_geografica",
      label: "Cobertura geográfica",
      type: {
        kind: "text",
        placeholder: "Ej: Operaciones México y Centroamérica",
      },
    },
    {
      key: "verificacion_externa",
      label: "¿Verificación externa?",
      type: { kind: "bool_tri" },
    },
    {
      key: "verificador",
      label: "Verificador (si aplica)",
      hint: "Empresa auditora",
      type: { kind: "text", placeholder: "Ej: KPMG, PwC, Deloitte" },
    },
    {
      key: "nivel_aseguramiento",
      label: "Nivel de aseguramiento",
      hint: "Limitado o Razonable (si hubo verificación)",
      type: { kind: "text", placeholder: "Limitado / Razonable" },
    },
    {
      key: "url_reporte",
      label: "URL del reporte publicado",
      type: { kind: "text" },
    },
    {
      key: "notas",
      label: "Notas",
      type: { kind: "text", multiline: true },
    },
  ],
};

export const SERVICE_SCHEMAS: ServiceSchema[] = [
  DOBLE_MATERIALIDAD,
  ESR,
  INFORME_SOSTENIBILIDAD,
];

const DOBLE_MATERIALIDAD_IA: ServiceSchema = {
  key: "doble_materialidad_ia",
  label: "Doble materialidad IA",
  icon: "🤖",
  color: "bg-teal-50 border-teal-200 text-teal-900",
  description:
    "Estudio de doble materialidad asistido por IA. El flujo completo vive en la pestaña DM-IA del cliente.",
  summary: () => "Doble materialidad IA",
  fields: [],
};

export const SERVICE_BY_KEY: Record<ServiceKey, ServiceSchema> = {
  doble_materialidad: DOBLE_MATERIALIDAD,
  doble_materialidad_ia: DOBLE_MATERIALIDAD_IA,
  esr: ESR,
  informe_sostenibilidad: INFORME_SOSTENIBILIDAD,
};
