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

export default async function AutoUpdatePage() {
  const configs = await getConfigs();

  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
          Configuración
        </p>
        <h2 className="text-lg font-bold text-slate-900">Auto-actualización de datos</h2>
        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
          Decide qué recursos se actualizan automáticamente y con qué frecuencia.
          Cada noche a las 00:30 (hora CDMX), el sistema evalúa la configuración
          y dispara las actualizaciones que tocan según los días configurados.
        </p>
      </div>

      <AutoUpdateConfigTable initial={configs} />

      <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-600 leading-relaxed">
        <p className="font-semibold text-slate-700 mb-1">Notas:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>El cron único corre 1×/día (06:30 UTC = 00:30 CDMX). Plan Hobby de Vercel.</li>
          <li>Frecuencia mínima: 1 día. Máxima: 365 días.</li>
          <li>Cada cambio se audita en /configuracion/auditoria.</li>
          <li>Los handlers individuales son idempotentes: si fallan, próximo ciclo retoma.</li>
          <li>Costo IA estimado por ciclo varía por recurso (ver descripción).</li>
        </ul>
      </div>
    </div>
  );
}
