"use client";

// Checklist de cierre del Estudio de Doble Materialidad.
// Derivado de props calculadas en el componente padre — sin fetch propio.

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Props = {
  questionnaireProgress: { filled: number; total: number } | null;
  hasCompletedBenchmark: boolean;
  iroCount: number;
  includedIroCount: number;
  scoredIroCount: number;
  hasNisData: boolean;
  hasReport: boolean;
  hasResumen: boolean;
};

// ── Íconos SVG inline ─────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg
      className="w-4 h-4 text-emerald-600 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      className="w-4 h-4 text-rose-500 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Ítem de criterio ──────────────────────────────────────────────────────────

function CriterioItem({
  label,
  cumple,
  hint,
}: {
  label: string;
  cumple: boolean;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {cumple ? <IconCheck /> : <IconX />}
      <div>
        <span
          className={`text-sm ${
            cumple ? "text-slate-700" : "text-slate-600"
          }`}
        >
          {label}
        </span>
        {hint && !cumple && (
          <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
        )}
      </div>
    </li>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ChecklistCierre({
  questionnaireProgress,
  hasCompletedBenchmark,
  iroCount,
  includedIroCount,
  scoredIroCount,
  hasNisData,
  hasReport,
  hasResumen,
}: Props) {
  // Evaluar cada criterio
  const criterios = [
    {
      label: "Cuestionario de contexto completo",
      cumple:
        questionnaireProgress !== null &&
        questionnaireProgress.total > 0 &&
        questionnaireProgress.filled >= questionnaireProgress.total,
      hint: questionnaireProgress
        ? `${questionnaireProgress.filled} / ${questionnaireProgress.total} respuestas completadas`
        : "Sin datos de cuestionario",
    },
    {
      label: "Benchmark competitivo completado",
      cumple: hasCompletedBenchmark,
      hint: "Ejecuta el benchmark desde la sección correspondiente",
    },
    {
      label: "IROs generados (mínimo 10)",
      cumple: iroCount >= 10,
      hint: `${iroCount} IRO${iroCount !== 1 ? "s" : ""} registrados — se requieren al menos 10`,
    },
    {
      label: "IROs priorizados (70 % con scores asignados)",
      cumple:
        includedIroCount > 0 && scoredIroCount >= includedIroCount * 0.7,
      hint: `${scoredIroCount} de ${includedIroCount} IROs incluidos tienen score de impacto y financiero`,
    },
    {
      label: "Mapa NIS/IBSO capturado",
      cumple: hasNisData,
      hint: "Registra al menos una brecha en la sección NIS/IBSO",
    },
    {
      label: "Reporte DM generado",
      cumple: hasReport,
      hint: "Genera el reporte desde la sección Reporte DM",
    },
    {
      label: "Resumen ejecutivo generado",
      cumple: hasResumen,
      hint: "Genera el resumen ejecutivo desde la sección correspondiente",
    },
  ] as const;

  const cumplidos = criterios.filter((c) => c.cumple).length;
  const total = criterios.length;
  const pct = Math.round((cumplidos / total) * 100);
  const todosCompletos = cumplidos === total;

  return (
    <section className="border border-slate-200 rounded bg-white shadow-sm">
      {/* Encabezado */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">
          Checklist de cierre
        </p>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {cumplidos} / {total} criterios completados
          </h3>
          <span className="text-xs text-slate-400 tabular-nums">{pct}%</span>
        </div>
        {/* Progress bar plana estilo Salesforce */}
        <div className="mt-2 h-1 bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-brand-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${cumplidos} de ${total} criterios completados`}
          />
        </div>
      </div>

      {/* Lista de criterios */}
      <div className="px-5 py-4 border-l-4 border-l-brand-primary">
        <ul className="divide-y divide-slate-50" role="list">
          {criterios.map((c, i) => (
            <CriterioItem
              key={i}
              label={c.label}
              cumple={c.cumple}
              hint={"hint" in c ? c.hint : undefined}
            />
          ))}
        </ul>
      </div>

      {/* Banner de completado */}
      {todosCompletos && (
        <div className="mx-5 mb-4 bg-emerald-50 border border-emerald-200 rounded px-4 py-3">
          <p className="text-sm font-medium text-emerald-800">
            Estudio listo para presentar al cliente.
          </p>
        </div>
      )}
    </section>
  );
}
