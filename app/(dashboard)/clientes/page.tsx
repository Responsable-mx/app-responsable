import Link from "next/link";
import { listClients } from "@/lib/clients";
import { ClientsList } from "@/components/ClientsList";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await listClients().catch(() => []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-5 pb-4 border-b border-slate-200">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            Cartera · Cliente
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"} ·
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

      <ClientsList
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          sector: c.sector,
          countries: c.countries,
          size: c.size,
          updated_at: c.updated_at,
          frameworks: c.frameworks,
          certifications: c.certifications,
        }))}
      />
    </div>
  );
}
