import Link from "next/link";
import { TeamOccupancy } from "@/components/config/TeamOccupancy";

export const dynamic = "force-dynamic";

export default function EquipoPage() {
  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 pt-6 pb-5">
        <div className="max-w-5xl mx-auto flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide">Admin</div>
            <h1 className="text-lg font-bold text-slate-900 mt-0.5">Equipo</h1>
          </div>
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-primary-dark transition-colors mb-0.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Asignar → ficha de cliente
          </Link>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 max-w-5xl mx-auto">
          <p className="text-sm text-slate-600 mb-4">
            Ocupación actual del equipo. Para asignar consultores a un proyecto, ve a la ficha del cliente → tab Equipo.
          </p>
          <TeamOccupancy />
        </div>
      </main>
    </div>
  );
}
