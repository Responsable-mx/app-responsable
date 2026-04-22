import { PreferencesPanel } from "@/components/config/PreferencesPanel";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PreferenciasPage() {
  const tourVersion = (await getSetting<number>("tour_version")) ?? 1;
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">Preferencias</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Ajustes globales de la app que afectan a todo el equipo.
      </p>
      <PreferencesPanel currentTourVersion={tourVersion} />
    </div>
  );
}
