import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutoUpdateConfigTable } from "@/components/config/AutoUpdateConfigTable";
import type { AutoUpdateConfigRow } from "@/app/api/auto-update-config/route";

export const metadata: Metadata = { title: "Auto-update · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

async function getConfigs(): Promise<AutoUpdateConfigRow[]> {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("auto_update_config")
      .select("*")
      .order("resource_key");
    if (error) {
      console.error("[auto-update] fetch failed:", error.message);
      return [];
    }
    return (data ?? []) as AutoUpdateConfigRow[];
  } catch {
    return [];
  }
}

const usdFmt = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export default async function AutoUpdatePage() {
  const configs = await getConfigs();

  // ROI acumulado: suma sobre todos los recursos habilitados
  const totalCost    = configs.reduce((s, c) => s + (c.total_cost_usd    ?? 0), 0);
  const totalSavings = configs.reduce((s, c) => s + (c.total_savings_usd ?? 0), 0);
  const hasRoi = totalCost > 0 || totalSavings > 0;
  const roi = totalCost > 0 ? totalSavings / totalCost : null;

  // Color de tendencia: verde si ROI ≥ 5×, amarillo si ≥ 1×, rojo si < 1×
  const roiColor = roi === null
    ? "text-slate-400"
    : roi >= 5
    ? "text-emerald-700"
    : roi >= 1
    ? "text-amber-700"
    : "text-rose-700";

  const roiLabel = roi === null
    ? "Sin datos aún"
    : roi >= 5
    ? `${roi.toFixed(0)}× — cada peso invertido regresa ${roi.toFixed(0)} en trabajo manual ahorrado`
    : roi >= 1
    ? `${roi.toFixed(1)}× — se está recuperando la inversión`
    : `${roi.toFixed(1)}× — el costo supera el ahorro estimado`;

  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
          Configuración
        </p>
        <h2 className="text-lg font-bold text-slate-900">Actualizaciones automáticas</h2>
        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
          Decide qué información se actualiza sola y cada cuántos días.
          Todas las noches a las 00:45 (hora CDMX), el sistema revisa esta
          configuración y ejecuta las tareas que tocan según lo que hayas indicado.
        </p>
      </div>

      {/* ── KPI ROI ────────────────────────────────────────────────────────── */}
      {hasRoi && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[
            {
              label: "Costo acumulado",
              value: usdFmt.format(totalCost),
              sub: "Lo que han costado todas las ejecuciones automáticas hasta hoy",
              color: "text-slate-900",
            },
            {
              label: "Ahorro estimado",
              value: usdFmt.format(totalSavings),
              sub: "Trabajo manual de consultores que no fue necesario hacer",
              color: "text-emerald-700",
            },
            {
              label: "Retorno (ROI)",
              value: roi !== null ? `${roi >= 100 ? Math.round(roi) : roi.toFixed(1)}×` : "—",
              sub: roiLabel,
              color: roiColor,
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                {kpi.label}
              </p>
              <p className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      <AutoUpdateConfigTable initial={configs} />

      <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-600 leading-relaxed">
        <p className="font-semibold text-slate-700 mb-1">Cómo funciona:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>La revisión nocturna ocurre 1 vez al día. No puedes pedir más frecuencia que diaria (limitación del plan actual).</li>
          <li>Días configurables: entre 1 y 365. Si pones 90 días, la tarea se ejecuta cuando han pasado 90 días desde su última ejecución.</li>
          <li>Cada cambio aquí queda registrado en <span className="font-mono">Configuración → Auditoría</span>.</li>
          <li>Si una tarea falla en una noche, se vuelve a intentar la siguiente noche automáticamente.</li>
          <li>Cada tarea es independiente: si una falla, las demás siguen funcionando normal.</li>
        </ul>
      </div>
    </div>
  );
}
