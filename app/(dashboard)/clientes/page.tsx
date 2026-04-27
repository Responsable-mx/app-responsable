import Link from "next/link";
import { listClients } from "@/lib/clients";
import { ClientsList } from "@/components/ClientsList";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await listClients().catch(() => []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-600 mt-1">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"} ·
            Todos los consultores pueden ver y editar.
          </p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 transition-colors"
        >
          + Agregar cliente
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
