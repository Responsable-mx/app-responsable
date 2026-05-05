"use client";

import {
  getFieldValue,
  isWizardSchema,
  type FieldValue,
  type QuestionnaireBundle,
  type WizardField,
  type WizardStep,
} from "@/lib/questionnaires/types";

// ─────────────────────────────────────────────────────────────
// Mapping mockup AppShell (5 cards) ↔ wizard canónico (9 pasos)
// Fuente: Cuestionario_Contexto_Negocio.md (9 diapositivas)
// ─────────────────────────────────────────────────────────────

type MacroCard = {
  key: string;
  label: string;
  description: string;
  iconPath: string;
  iconBg: string;
  iconColor: string;
  accentBorder: string;
  // Subset de stepKeys del wizard que componen esta card macro
  stepKeys: string[];
  // Campos clave a mostrar en preview (subset key + label override opcional)
  previewFields: { stepKey: string; fieldKey: string; labelOverride?: string }[];
};

const MACRO_CARDS: MacroCard[] = [
  {
    key: "informacion-base",
    label: "Información base",
    description: "Datos generales, giro, ubicación, tamaño",
    iconPath:
      "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
    accentBorder: "border-l-emerald-500",
    stepKeys: ["informacion-base"],
    previewFields: [
      { stepKey: "informacion-base", fieldKey: "nombre_empresa", labelOverride: "Razón social" },
      { stepKey: "informacion-base", fieldKey: "servicio_contratado", labelOverride: "Servicio" },
      { stepKey: "informacion-base", fieldKey: "alcance_geografico", labelOverride: "Alcance" },
      { stepKey: "informacion-base", fieldKey: "relacion_empresas", labelOverride: "Relación" },
    ],
  },
  {
    key: "contexto-general",
    label: "Contexto general",
    description: "Entorno económico, social y competitivo",
    iconPath:
      "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    iconBg: "bg-brand-primary-light",
    iconColor: "text-brand-primary-dark",
    accentBorder: "border-l-brand-primary",
    stepKeys: ["informacion-general"],
    previewFields: [
      { stepKey: "informacion-general", fieldKey: "sector", labelOverride: "Sector" },
      { stepKey: "informacion-general", fieldKey: "empleados", labelOverride: "Empleados" },
      { stepKey: "informacion-general", fieldKey: "paises", labelOverride: "Países" },
      { stepKey: "informacion-general", fieldKey: "tipo_clientes", labelOverride: "Clientes clave" },
    ],
  },
  {
    key: "contexto-sostenibilidad",
    label: "Contexto sostenibilidad",
    description: "Compromisos, política y madurez ESG",
    iconPath:
      "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    accentBorder: "border-l-amber-500",
    stepKeys: ["estrategia-y-madurez"],
    previewFields: [
      { stepKey: "estrategia-y-madurez", fieldKey: "modelo_sostenibilidad", labelOverride: "Modelo" },
      { stepKey: "estrategia-y-madurez", fieldKey: "certificaciones", labelOverride: "Certificaciones" },
      { stepKey: "estrategia-y-madurez", fieldKey: "tiene_informe", labelOverride: "Reporte formal" },
      { stepKey: "estrategia-y-madurez", fieldKey: "kpis_medidos", labelOverride: "KPIs medidos" },
    ],
  },
  {
    key: "regulatorio",
    label: "Regulatorio",
    description: "Marco legal, obligaciones y riesgos normativos",
    iconPath:
      "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-700",
    accentBorder: "border-l-rose-500",
    stepKeys: ["regulacion-y-sector"],
    previewFields: [
      { stepKey: "regulacion-y-sector", fieldKey: "regulaciones", labelOverride: "Regulaciones" },
      { stepKey: "regulacion-y-sector", fieldKey: "referentes_sector", labelOverride: "Referentes" },
      { stepKey: "regulacion-y-sector", fieldKey: "competidores_reportan", labelOverride: "Competidores" },
      { stepKey: "regulacion-y-sector", fieldKey: "tendencias_sector", labelOverride: "Tendencias" },
    ],
  },
  {
    key: "modelo-negocio",
    label: "Modelo negocio",
    description: "Cadena de valor, stakeholders y dependencias",
    iconPath:
      "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-700",
    accentBorder: "border-l-slate-500",
    stepKeys: [
      "modelo-de-negocio-estructura",
      "modelo-de-negocio-detalle",
      "cadena-de-valor",
      "riesgos-y-oportunidades",
      "stakeholders",
    ],
    previewFields: [
      { stepKey: "modelo-de-negocio-detalle", fieldKey: "propuesta_valor", labelOverride: "Propuesta valor" },
      { stepKey: "modelo-de-negocio-detalle", fieldKey: "dependencias_criticas", labelOverride: "Dep. crítica" },
      { stepKey: "cadena-de-valor", fieldKey: "proveedores_top5", labelOverride: "Proveedores top" },
      { stepKey: "stakeholders", fieldKey: "grupos_clave", labelOverride: "Stakeholders" },
    ],
  },
];

export function ClientResumen({
  questionnaire,
  onJumpToCuestionario,
}: {
  questionnaire: QuestionnaireBundle | null;
  onJumpToCuestionario: (firstStepKey?: string) => void;
}) {
  if (!questionnaire) {
    return (
      <div className="border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
        Cargando resumen…
      </div>
    );
  }

  const { template, response, progress } = questionnaire;
  const responses = response?.responses ?? {};

  // Construir mapping step → fields (para legacy schemas que NO son wizard también)
  const stepsByKey = new Map<string, WizardStep>();
  if (isWizardSchema(template.schema)) {
    for (const s of template.schema.steps) stepsByKey.set(s.key, s);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {MACRO_CARDS.map((card) => {
        // Sumar progreso de todos los steps de la card macro
        let filled = 0;
        let total = 0;
        for (const sk of card.stepKeys) {
          const sp = progress.sectionProgress[sk];
          if (sp) {
            filled += sp.filled;
            total += sp.total;
          }
        }
        const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
        const isComplete = pct === 100 && total > 0;

        // Resolver labels reales desde el step si existen
        const resolvedFields = card.previewFields.map((pf) => {
          const step = stepsByKey.get(pf.stepKey);
          const field: WizardField | undefined = step?.fields.find((f) => f.key === pf.fieldKey);
          const label = pf.labelOverride ?? field?.label ?? pf.fieldKey;
          const sectionResp = (responses[pf.stepKey] as Record<string, unknown> | undefined) ?? {};
          const value = getFieldValue(sectionResp[pf.fieldKey]);
          return { label, value };
        });

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onJumpToCuestionario(card.stepKeys[0])}
            className={`group bg-white border border-slate-200 ${card.accentBorder} border-l-4 rounded shadow-sm overflow-hidden text-left hover:shadow-md hover:border-brand-primary/40 transition-all`}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <div className={`w-10 h-10 rounded ${card.iconBg} flex items-center justify-center shrink-0`}>
                <svg className={`w-5 h-5 ${card.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.iconPath} />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {card.label}
                </h3>
                <p className="text-xs text-slate-600 truncate mt-0.5">{card.description}</p>
              </div>
              {isComplete && (
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>

            <div className="px-4 py-3">
              <dl className="space-y-1.5">
                {resolvedFields.map((f, i) => {
                  const display = formatValue(f.value);
                  return (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <dt className="text-slate-500 shrink-0 w-32 truncate">{f.label}</dt>
                      <dd className={`flex-1 min-w-0 ${display === "—" ? "text-slate-400 italic" : "text-slate-800 font-medium"}`}>
                        {display}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>

            <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-600 tabular-nums">
                {filled}/{total} campos
              </span>
              <div className="flex-1 h-1 bg-slate-100 rounded-sm overflow-hidden mx-2">
                <div
                  className={`h-full transition-all ${isComplete ? "bg-emerald-500" : pct > 0 ? "bg-brand-primary" : "bg-slate-300"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[11px] font-bold tabular-nums ${isComplete ? "text-emerald-700" : "text-slate-700"}`}>
                {pct}%
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatValue(value: FieldValue): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "—";
    return trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed;
  }
  if (typeof value === "number") return value.toLocaleString("es-MX");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  return "—";
}
