"use client";

import Link from "next/link";
import type { Client } from "@/lib/clients";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";
import type { MaterialityTopic } from "@/lib/materiality/types";

type Props = {
  client: Client;
  completeness: { filled: number; total: number };
  questionnaire: QuestionnaireBundle | null;
  materialityTopics: MaterialityTopic[];
  servicesCount: number | null;
  onJumpToTab: (tab: "contexto" | "servicios" | "cuestionario" | "materialidad") => void;
};

export function ClientResumen({
  client,
  completeness,
  questionnaire,
  materialityTopics,
  servicesCount,
  onJumpToTab,
}: Props) {
  const pctContexto = Math.round((completeness.filled / completeness.total) * 100);
  const pctCuestionario = questionnaire?.progress.pct ?? null;
  const dmCount = materialityTopics.filter((t) => t.color === "rose").length;
  const finCount = materialityTopics.filter((t) => t.color === "teal").length;
  const impCount = materialityTopics.filter((t) => t.color === "amber").length;
  const segCount = materialityTopics.filter((t) => t.color === "slate").length;

  return (
    <div className="space-y-5">
      {/* Identificación */}
      <Section
        title="Identificación"
        description="Datos básicos del cliente"
        onEdit={() => onJumpToTab("contexto")}
      >
        <Grid>
          <Field label="Razón social" value={client.name} />
          <Field label="Sector" value={client.sector ?? "—"} />
          <Field label="Subsector" value={client.subsector ?? "—"} />
          <Field label="Tamaño" value={client.size ?? "—"} />
          <Field label="Países" value={client.countries?.join(", ") ?? "—"} />
          <Field label="Madurez" value={client.maturity_level ?? "—"} />
        </Grid>
      </Section>

      {/* Atributos sostenibilidad */}
      <Section
        title="Sostenibilidad"
        description="Frameworks, regulaciones, certificaciones"
        onEdit={() => onJumpToTab("contexto")}
      >
        <Grid>
          <ChipsField label="Frameworks" values={client.frameworks ?? []} tone="primary" />
          <ChipsField label="Regulaciones" values={client.applicable_regulations ?? []} tone="amber" />
          <ChipsField label="Certificaciones" values={client.certifications ?? []} tone="emerald" />
          <ChipsField label="Servicios contratados" values={client.services ?? []} tone="slate" />
          <BoolField label="Doble materialidad activa" value={client.has_double_materiality} />
          <BoolField label="Reporte publicado" value={client.has_sustainability_report} />
        </Grid>
      </Section>

      {/* Progreso por sección entrega */}
      <Section
        title="Progreso del estudio"
        description="Avance en cada componente del entregable"
      >
        <div className="space-y-3">
          <ProgressRow
            label="Contexto"
            sub={`${completeness.filled}/${completeness.total} campos`}
            pct={pctContexto}
            onClick={() => onJumpToTab("contexto")}
          />
          <ProgressRow
            label="Servicios"
            sub={
              servicesCount === null
                ? "Cargando…"
                : servicesCount === 0
                  ? "Sin servicios"
                  : `${servicesCount} contratado${servicesCount === 1 ? "" : "s"}`
            }
            pct={null}
            onClick={() => onJumpToTab("servicios")}
          />
          <ProgressRow
            label="Cuestionario"
            sub={
              pctCuestionario === null
                ? "Cargando…"
                : pctCuestionario === 100
                  ? "Completo"
                  : pctCuestionario === 0
                    ? "Sin iniciar"
                    : `${questionnaire?.progress.filledFields ?? 0}/${questionnaire?.progress.totalFields ?? 0} campos`
            }
            pct={pctCuestionario}
            onClick={() => onJumpToTab("cuestionario")}
          />
          <ProgressRow
            label="Materialidad"
            sub={
              materialityTopics.length === 0
                ? "Sin temas"
                : `${dmCount} doble · ${finCount} financiero · ${impCount} impacto · ${segCount} seguimiento`
            }
            pct={materialityTopics.length === 0 ? 0 : Math.min(100, Math.round((materialityTopics.length / 20) * 100))}
            onClick={() => onJumpToTab("materialidad")}
          />
        </div>
      </Section>

      {/* Documentos clave */}
      {(client.sustainability_strategy_url || client.sustainability_report_url || client.double_materiality_url) && (
        <Section title="Documentos clave" description="Enlaces a entregables previos del cliente">
          <div className="space-y-1.5">
            {client.sustainability_strategy_url && (
              <DocLink label="Estrategia de sostenibilidad" url={client.sustainability_strategy_url} />
            )}
            {client.sustainability_report_url && (
              <DocLink label="Reporte de sostenibilidad" url={client.sustainability_report_url} />
            )}
            {client.double_materiality_url && (
              <DocLink label="Doble materialidad anterior" url={client.double_materiality_url} />
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  onEdit,
  children,
}: {
  title: string;
  description?: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</h3>
          {description && <p className="text-xs text-slate-600 mt-0.5">{description}</p>}
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-[11px] text-brand-primary hover:text-brand-primary-dark hover:underline transition-colors shrink-0"
          >
            Editar →
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function ChipsField({
  label,
  values,
  tone,
}: {
  label: string;
  values: string[];
  tone: "primary" | "amber" | "emerald" | "slate";
}) {
  const cls =
    tone === "primary"
      ? "bg-brand-primary-light text-brand-primary-dark"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "emerald"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-700";
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</dt>
      <dd>
        {values.length === 0 ? (
          <span className="text-sm text-slate-400 italic">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {values.map((v) => (
              <span key={v} className={`text-[11px] rounded-sm px-1.5 py-0.5 font-medium ${cls}`}>
                {v}
              </span>
            ))}
          </div>
        )}
      </dd>
    </div>
  );
}

function BoolField({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm">
        {value === true ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Sí
          </span>
        ) : value === false ? (
          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            No
          </span>
        ) : (
          <span className="text-slate-400 italic">Sin definir</span>
        )}
      </dd>
    </div>
  );
}

function ProgressRow({
  label,
  sub,
  pct,
  onClick,
}: {
  label: string;
  sub: string;
  pct: number | null;
  onClick: () => void;
}) {
  const tone =
    pct === null
      ? "neutral"
      : pct === 100
        ? "success"
        : pct >= 50
          ? "primary"
          : pct > 0
            ? "warn"
            : "neutral";
  const fillCls =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "primary"
        ? "bg-brand-primary"
        : tone === "warn"
          ? "bg-amber-500"
          : "bg-slate-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 hover:bg-slate-50 -mx-2 px-2 py-2 rounded transition-colors text-left group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-700">{label}</span>
          {pct !== null && (
            <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-sm ${
              tone === "success"
                ? "bg-emerald-50 text-emerald-700"
                : tone === "primary"
                  ? "bg-brand-primary-light text-brand-primary-dark"
                  : tone === "warn"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-500"
            }`}>
              {pct}%
            </span>
          )}
          <span className="text-[11px] text-slate-500 truncate">{sub}</span>
        </div>
        {pct !== null && (
          <div className="h-1 bg-slate-100 rounded-sm overflow-hidden">
            <div className={`h-full ${fillCls} transition-all`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <svg className="w-4 h-4 text-slate-300 group-hover:text-brand-primary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function DocLink({ label, url }: { label: string; url: string }) {
  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs text-brand-primary-dark hover:text-brand-primary-hover hover:underline"
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      {label}
    </Link>
  );
}
