"use client";

export interface EvmMetrics {
  pcDone: number;
  pcElapsed: number;
  spi: number;
  forecastEnd: Date | null;
  varianceDays: number | null;
  planEndDate: Date;
}

interface GanttEvmProps {
  metrics: EvmMetrics | null;
}

export function GanttEvm({ metrics }: GanttEvmProps) {
  if (!metrics) {
    return (
      <div className="px-4 py-2 text-[10px] text-slate-400 border-b border-slate-200 bg-slate-50/80">
        EVM disponible cuando hay actividades completadas y fechas plan definidas.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5 px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex-wrap">
      {/* Dual progress bar: real vs planeado */}
      <div className="flex-1 min-w-[140px] max-w-xs space-y-0.5">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Avance real
          </span>
          <span className="text-[9px] font-bold tabular-nums text-slate-600">
            {metrics.pcDone}%
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-sm overflow-hidden relative">
          {/* Tiempo transcurrido (planeado) */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-slate-400/30"
            style={{ width: `${metrics.pcElapsed}%` }}
            title={`Tiempo plan transcurrido: ${metrics.pcElapsed}%`}
          />
          {/* Avance real */}
          <div
            className={`absolute top-0 bottom-0 left-0 transition-all ${
              metrics.pcDone >= metrics.pcElapsed ? "bg-emerald-500" : "bg-amber-500"
            }`}
            style={{ width: `${metrics.pcDone}%` }}
          />
        </div>
        <div className="text-[8px] text-slate-400 tabular-nums">
          Plan: {metrics.pcElapsed}% tiempo · Real: {metrics.pcDone}% avance
        </div>
      </div>

      {/* SPI */}
      <div
        className="shrink-0 text-center"
        title="SPI (Schedule Performance Index) — índice de eficiencia de tiempo. SPI = avance real ÷ avance esperado. SPI ≥ 1.0 = adelantado o en tiempo · 0.8–0.99 = leve retraso · <0.8 = riesgo alto de no entregar a tiempo."
      >
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">SPI</p>
        <p
          className={`text-base font-bold tabular-nums leading-none ${
            metrics.spi >= 1
              ? "text-emerald-600"
              : metrics.spi >= 0.8
              ? "text-amber-600"
              : "text-rose-600"
          }`}
        >
          {metrics.spi.toFixed(2)}
        </p>
        <p className="text-[8px] text-slate-400 mt-0.5">
          {metrics.spi >= 1 ? "en tiempo" : metrics.spi >= 0.8 ? "leve retraso" : "riesgo alto"}
        </p>
      </div>

      {/* Pronóstico cierre */}
      {metrics.forecastEnd && (
        <div
          className="shrink-0"
          title="Est. Cierre — fecha proyectada de terminación basada en el ritmo actual de avance. Si el SPI < 1 (retraso), la fecha se desplaza hacia adelante."
        >
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
            Est. cierre
          </p>
          <p className="text-xs font-bold text-slate-700 tabular-nums leading-snug">
            {metrics.forecastEnd.toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            })}
          </p>
          <p className="text-[8px] text-slate-400">
            plan:{" "}
            {metrics.planEndDate.toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            })}
          </p>
        </div>
      )}

      {/* Varianza días */}
      {metrics.varianceDays !== null && (
        <div
          className="shrink-0 text-center"
          title="Varianza — diferencia en días entre la fecha estimada de cierre y la fecha plan original. Valor negativo = retraso."
        >
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
            Varianza
          </p>
          <p
            className={`text-base font-bold tabular-nums leading-none ${
              metrics.varianceDays >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {metrics.varianceDays > 0 ? `+${metrics.varianceDays}` : metrics.varianceDays}d
          </p>
          <p className="text-[8px] text-slate-400 mt-0.5">
            {metrics.varianceDays >= 0 ? "adelantado" : "retrasado"}
          </p>
        </div>
      )}
    </div>
  );
}
