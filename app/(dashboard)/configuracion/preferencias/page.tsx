import { PreferencesPanel } from "@/components/config/PreferencesPanel";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PreferenciasPage() {
  const tourVersion = (await getSetting<number>("tour_version")) ?? 1;
  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Ajustes globales de la app que afectan a todo el equipo.
      </p>
      <PreferencesPanel currentTourVersion={tourVersion} />
    </div>
  );
}
