import { TeamOccupancy } from "@/components/config/TeamOccupancy";

export const dynamic = "force-dynamic";

export default function EquipoPage() {
  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 pt-6 pb-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-[10px] text-slate-600 uppercase tracking-wide">Admin</div>
          <h1 className="text-lg font-bold text-slate-900 mt-0.5">Equipo</h1>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 max-w-5xl mx-auto">
          <p className="text-sm text-slate-600 mb-4">
            Ocupación actual del equipo. Verde = capacidad disponible · Ámbar = carga alta · Rojo = sobrecargado.
          </p>
          <TeamOccupancy />
        </div>
      </main>
    </div>
  );
}
