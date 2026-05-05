import Link from "next/link";
import { ClientsList } from "@/components/ClientsList";

// D-05: búsqueda server-side. La página ya no carga todos los clientes en el servidor;
// ClientsList usa SWR con debounce 300ms → /api/clients?q=... para filtrar en Supabase.
// Beneficios: tiempo de carga inicial < 200ms (no DB call), búsqueda escala sin límite.
export default function ClientesPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-5 pb-4 border-b border-slate-200">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            Clientes
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Todos los consultores pueden ver y editar.
          </p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-primary-hover text-white text-sm font-medium rounded hover:bg-brand-primary-dark transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar cliente
        </Link>
      </div>

      <ClientsList />
    </div>
  );
}
