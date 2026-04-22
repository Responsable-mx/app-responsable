/**
 * Schemas de los 6 bloques narrativos de un cliente. Definen qué sub-campos
 * tiene cada bloque JSONB y qué tipo de input usar en el form. Viven en
 * código (fuente de verdad). Para cambiarlos: edita este archivo y deploy.
 *
 * Client-safe: no importar 'server-only'.
 */

import type { CatalogCategory } from "@/lib/catalogs/seeds";

// ── Tipos de campo ───────────────────────────────────────────
export type FieldType =
  | { kind: "text"; multiline?: boolean; placeholder?: string }
  | { kind: "number"; unit?: string; min?: number; max?: number }
  | { kind: "year" }
  | { kind: "bool_tri" } // null / false / true
  | { kind: "string_list"; placeholder?: string; maxItems?: number }
  | {
      kind: "object_list";
      itemLabel: string;
      maxItems?: number;
      schema: FieldDef[]; // sub-campos del objeto
    }
  | { kind: "catalog_multi"; category: CatalogCategory }
  | { kind: "catalog_single"; category: CatalogCategory };

export type FieldDef = {
  key: string;
  label: string;
  hint?: string;
  type: FieldType;
};

export type NarrativeBlockKey =
  | "info_general"
  | "business_model"
  | "impacts"
  | "regulatory_context"
  | "sustainability_strategy"
  | "stakeholders";

export type BlockSchema = {
  block: NarrativeBlockKey;
  jsonColumn: `${NarrativeBlockKey}_json`;
  title: string;
  description: string;
  fields: FieldDef[];
};

// ─────────────────────────────────────────────────────────────
// 1. Operaciones y productos
// ─────────────────────────────────────────────────────────────
const INFO_GENERAL: BlockSchema = {
  block: "info_general",
  jsonColumn: "info_general_json",
  title: "1. Operaciones y productos",
  description:
    "Detalle de la operación actual. Nombre, sector, países y tamaño ya viven arriba en Identificación.",
  fields: [
    {
      key: "unidades_negocio",
      label: "Unidades de negocio",
      hint: "Divisiones o líneas principales del cliente.",
      type: { kind: "string_list", placeholder: "Ej: Cervezas MX, Refrescos MX" },
    },
    {
      key: "revenue_split",
      label: "% ingresos por línea",
      type: {
        kind: "object_list",
        itemLabel: "línea",
        maxItems: 15,
        schema: [
          {
            key: "linea",
            label: "Línea de negocio",
            type: { kind: "text", placeholder: "Ej: Cervezas" },
          },
          {
            key: "porcentaje",
            label: "% ingresos",
            type: { kind: "number", unit: "%", min: 0, max: 100 },
          },
        ],
      },
    },
    {
      key: "productos_principales",
      label: "Productos / servicios principales",
      type: {
        kind: "text",
        multiline: true,
        placeholder: "Marcas, SKUs o servicios clave.",
      },
    },
    {
      key: "volumen_anual",
      label: "Volumen anual relevante",
      hint: "Métricas operativas de referencia (producción, clientes atendidos, etc.).",
      type: { kind: "text", placeholder: "Ej: 42 Mhl/año 2025" },
    },
    {
      key: "notas",
      label: "Notas adicionales",
      type: { kind: "text", multiline: true },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 2. Modelo de negocio
// ─────────────────────────────────────────────────────────────
const BUSINESS_MODEL: BlockSchema = {
  block: "business_model",
  jsonColumn: "business_model_json",
  title: "2. Modelo de negocio",
  description:
    "Cómo genera ingresos, propuesta de valor, dependencias críticas. Segmentos (B2B/B2C) ya están en Atributos.",
  fields: [
    {
      key: "tipo_ingresos",
      label: "Modelos de ingresos",
      hint: "Cómo factura el cliente (puede tener varios).",
      type: { kind: "catalog_multi", category: "revenue_models" },
    },
    {
      key: "propuesta_valor",
      label: "Propuesta de valor diferencial",
      type: { kind: "text", multiline: true },
    },
    {
      key: "costos_principales",
      label: "Costos operativos principales",
      type: {
        kind: "text",
        multiline: true,
        placeholder: "Ej: Materia prima, energía, transporte",
      },
    },
    {
      key: "capex_relevante",
      label: "CAPEX relevante",
      hint: "Inversiones en infraestructura, plantas, tecnología, etc.",
      type: { kind: "text", multiline: true },
    },
    {
      key: "dependencias_criticas",
      label: "Dependencias críticas",
      hint: "Proveedores, talento, tecnología o recursos con alto impacto ante disrupción.",
      type: {
        kind: "string_list",
        placeholder: "Ej: Agua del acuífero Tecate",
        maxItems: 15,
      },
    },
    {
      key: "notas",
      label: "Notas adicionales",
      type: { kind: "text", multiline: true },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 3. Impactos ESG actuales
// ─────────────────────────────────────────────────────────────
const emisionesSchema: FieldDef[] = [
  { key: "medido", label: "¿Medido?", type: { kind: "bool_tri" } },
  {
    key: "valor",
    label: "Valor actual",
    type: { kind: "number", unit: "tCO2e" },
  },
  { key: "base_year", label: "Base year", type: { kind: "year" } },
  {
    key: "target",
    label: "Meta declarada",
    type: { kind: "text", placeholder: "Ej: -30% vs 2023 al 2030" },
  },
];

const IMPACTS: BlockSchema = {
  block: "impacts",
  jsonColumn: "impacts_json",
  title: "3. Impactos ESG actuales",
  description:
    "Datos duros sobre huella del cliente. Si algo no está medido, marca 'No' y déjalo vacío; es información útil por sí misma.",
  fields: [
    {
      key: "emisiones_alcance_1_2",
      label: "Emisiones alcance 1 + 2",
      type: {
        kind: "object_list",
        itemLabel: "reporte",
        maxItems: 1,
        schema: emisionesSchema,
      },
    },
    {
      key: "emisiones_alcance_3",
      label: "Emisiones alcance 3",
      type: {
        kind: "object_list",
        itemLabel: "reporte",
        maxItems: 1,
        schema: emisionesSchema,
      },
    },
    {
      key: "agua_m3",
      label: "Consumo de agua",
      hint: "Volumen anual y si opera en zona de estrés hídrico.",
      type: {
        kind: "object_list",
        itemLabel: "agua",
        maxItems: 1,
        schema: [
          { key: "medido", label: "¿Medido?", type: { kind: "bool_tri" } },
          {
            key: "valor",
            label: "Volumen anual",
            type: { kind: "number", unit: "m³" },
          },
          {
            key: "estres_hidrico",
            label: "¿Opera en zona de estrés hídrico?",
            type: { kind: "bool_tri" },
          },
        ],
      },
    },
    {
      key: "residuos",
      label: "Residuos",
      type: {
        kind: "object_list",
        itemLabel: "residuos",
        maxItems: 1,
        schema: [
          { key: "medido", label: "¿Medido?", type: { kind: "bool_tri" } },
          {
            key: "valor",
            label: "Toneladas anuales",
            type: { kind: "number", unit: "t" },
          },
          {
            key: "pct_reciclaje",
            label: "% reciclado",
            type: { kind: "number", unit: "%", min: 0, max: 100 },
          },
        ],
      },
    },
    {
      key: "biodiversidad_relevante",
      label: "¿Biodiversidad es tema material?",
      type: { kind: "bool_tri" },
    },
    {
      key: "rotacion_personal_pct",
      label: "Rotación anual de personal",
      type: { kind: "number", unit: "%", min: 0, max: 100 },
    },
    {
      key: "ltifr",
      label: "LTIFR (tasa accidentes c/tiempo perdido)",
      hint: "Por millón de horas trabajadas.",
      type: { kind: "number", min: 0 },
    },
    {
      key: "diversidad_mujeres_liderazgo_pct",
      label: "% mujeres en liderazgo",
      type: { kind: "number", unit: "%", min: 0, max: 100 },
    },
    {
      key: "incidentes_relevantes",
      label: "Incidentes o multas relevantes",
      hint: "Casos públicos: multas ambientales, denuncias, conflictos laborales, etc.",
      type: { kind: "string_list", maxItems: 20 },
    },
    {
      key: "relacion_comunidades",
      label: "Relación con comunidades",
      type: { kind: "text", multiline: true },
    },
    {
      key: "notas",
      label: "Notas adicionales",
      type: { kind: "text", multiline: true },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 4. Contexto sectorial
// ─────────────────────────────────────────────────────────────
const REGULATORY_CONTEXT: BlockSchema = {
  block: "regulatory_context",
  jsonColumn: "regulatory_context_json",
  title: "4. Contexto sectorial",
  description:
    "Fuerzas externas que moldean la agenda del cliente. Regulaciones aplicables ya están en Atributos.",
  fields: [
    {
      key: "requerimientos_cadena",
      label: "Requerimientos de cadena global",
      hint: "Qué exigen sus clientes B2B o casas matrices en sostenibilidad.",
      type: { kind: "text", multiline: true },
    },
    {
      key: "presion_inversionistas",
      label: "Presión de inversionistas",
      hint: "Fondos activistas, score ESG exigido, ratings aplicables.",
      type: { kind: "text", multiline: true },
    },
    {
      key: "tendencias_sector",
      label: "Top 3 tendencias ESG del sector",
      type: { kind: "string_list", maxItems: 3 },
    },
    {
      key: "benchmark_competidores",
      label: "Benchmark de competidores",
      type: {
        kind: "object_list",
        itemLabel: "competidor",
        maxItems: 10,
        schema: [
          { key: "nombre", label: "Competidor", type: { kind: "text" } },
          {
            key: "notas",
            label: "Qué reporta / diferenciador ESG",
            type: { kind: "text", multiline: true },
          },
        ],
      },
    },
    {
      key: "notas",
      label: "Notas adicionales",
      type: { kind: "text", multiline: true },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 5. Estrategia y materialidad
// ─────────────────────────────────────────────────────────────
const SUSTAINABILITY_STRATEGY: BlockSchema = {
  block: "sustainability_strategy",
  jsonColumn: "sustainability_strategy_json",
  title: "5. Estrategia y materialidad",
  description:
    "Los pilares, metas y KPIs de la estrategia ESG del cliente. Booleanos de 'existe estrategia/reporte/doble materialidad' ya están en Atributos; aquí va el detalle.",
  fields: [
    {
      key: "pilares",
      label: "Pilares de la estrategia",
      hint: "Nombres cortos (3 a 5 pilares).",
      type: {
        kind: "string_list",
        placeholder: "Ej: Cambio climático",
        maxItems: 8,
      },
    },
    {
      key: "objetivos",
      label: "Objetivos principales",
      type: {
        kind: "object_list",
        itemLabel: "objetivo",
        maxItems: 15,
        schema: [
          {
            key: "pilar",
            label: "Pilar al que pertenece",
            type: { kind: "text" },
          },
          {
            key: "meta",
            label: "Meta",
            type: {
              kind: "text",
              multiline: true,
              placeholder: "Ej: Net zero alcance 1+2 al 2040",
            },
          },
          { key: "deadline", label: "Año meta", type: { kind: "year" } },
        ],
      },
    },
    {
      key: "kpis",
      label: "KPIs activos",
      hint: "Indicadores que el cliente ya mide y publica.",
      type: {
        kind: "object_list",
        itemLabel: "KPI",
        maxItems: 20,
        schema: [
          {
            key: "metrica",
            label: "Métrica",
            type: {
              kind: "text",
              placeholder: "Ej: Emisiones alcance 1+2",
            },
          },
          {
            key: "valor_actual",
            label: "Valor actual",
            type: { kind: "text" },
          },
          { key: "unidad", label: "Unidad", type: { kind: "text" } },
          {
            key: "target",
            label: "Target",
            type: { kind: "text" },
          },
          { key: "base_year", label: "Base year", type: { kind: "year" } },
        ],
      },
    },
    {
      key: "reportes_publicados",
      label: "Reportes de sostenibilidad publicados",
      type: {
        kind: "object_list",
        itemLabel: "reporte",
        maxItems: 10,
        schema: [
          { key: "ano", label: "Año", type: { kind: "year" } },
          {
            key: "marco",
            label: "Marco usado",
            type: { kind: "catalog_single", category: "frameworks" },
          },
          { key: "url", label: "URL pública", type: { kind: "text" } },
        ],
      },
    },
    {
      key: "materialidad_metodologia",
      label: "Metodología del estudio de materialidad",
      type: {
        kind: "text",
        multiline: true,
        placeholder: "Ej: Encuestas + entrevistas con stakeholders + análisis de prensa.",
      },
    },
    {
      key: "materialidad_ano",
      label: "Año del último estudio",
      type: { kind: "year" },
    },
    {
      key: "materialidad_proximo_refresh",
      label: "Próximo refresh previsto",
      type: { kind: "year" },
    },
    {
      key: "notas",
      label: "Notas adicionales",
      type: { kind: "text", multiline: true },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 6. Stakeholders
// ─────────────────────────────────────────────────────────────
const STAKEHOLDERS: BlockSchema = {
  block: "stakeholders",
  jsonColumn: "stakeholders_json",
  title: "6. Stakeholders",
  description:
    "Grupos clave, su nivel de dependencia, canales y expectativas. La base para el estudio de materialidad.",
  fields: [
    {
      key: "grupos_clave",
      label: "Grupos clave",
      type: {
        kind: "object_list",
        itemLabel: "grupo",
        maxItems: 20,
        schema: [
          {
            key: "grupo",
            label: "Grupo",
            type: {
              kind: "text",
              placeholder: "Ej: Comunidades Tecate",
            },
          },
          {
            key: "dependencia",
            label: "Nivel de dependencia",
            type: {
              kind: "text",
              placeholder: "alta / media / baja",
            },
          },
          {
            key: "canal",
            label: "Canal de relación",
            type: {
              kind: "text",
              placeholder: "Ej: Mesa trimestral, encuestas",
            },
          },
          {
            key: "expectativas",
            label: "Expectativas principales",
            type: { kind: "text", multiline: true },
          },
        ],
      },
    },
    {
      key: "conflictos_activos",
      label: "Conflictos o tensiones activas",
      type: { kind: "text", multiline: true },
    },
    {
      key: "notas",
      label: "Notas adicionales",
      type: { kind: "text", multiline: true },
    },
  ],
};

export const NARRATIVE_SCHEMAS: BlockSchema[] = [
  INFO_GENERAL,
  BUSINESS_MODEL,
  IMPACTS,
  REGULATORY_CONTEXT,
  SUSTAINABILITY_STRATEGY,
  STAKEHOLDERS,
];

// ── Helpers de conteo (completitud) ──────────────────────────

/**
 * Cuántos sub-campos totales suman los 6 schemas.
 * Usado por completitud para el denominador.
 */
export function countAllSubfields(): number {
  return NARRATIVE_SCHEMAS.reduce((n, s) => n + s.fields.length, 0);
}

/** ¿Este valor se considera "lleno"? Criterios mínimos por tipo. */
export function isFieldFilled(type: FieldType, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  switch (type.kind) {
    case "text":
      return typeof value === "string" && value.trim().length > 0;
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "year":
      return typeof value === "number" && value > 1900 && value < 3000;
    case "bool_tri":
      return typeof value === "boolean";
    case "string_list":
    case "catalog_multi":
      return Array.isArray(value) && value.length > 0;
    case "catalog_single":
      return typeof value === "string" && value.length > 0;
    case "object_list":
      return Array.isArray(value) && value.length > 0;
  }
}

/** Cuenta sub-campos llenos en un JSONB de un bloque. */
export function countFilledInBlock(
  schema: BlockSchema,
  json: Record<string, unknown> | null | undefined
): number {
  if (!json) return 0;
  return schema.fields.filter((f) => isFieldFilled(f.type, json[f.key])).length;
}
