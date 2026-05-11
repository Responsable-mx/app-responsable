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
        <h2 className="text-lg font-bold text-slate-900">Actualizaciones automáticas</h2>
        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
          Decide qué información se actualiza sola y cada cuántos días.
          Todas las noches a las 00:45 (hora CDMX), el sistema revisa esta
          configuración y ejecuta las tareas que tocan según lo que hayas indicado.
        </p>
      </div>

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
