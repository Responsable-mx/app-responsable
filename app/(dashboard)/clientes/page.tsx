import Link from "next/link";
import { listClients } from "@/lib/clients";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await listClients().catch(() => []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500 mt-1">
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

      {clients.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center">
          <p className="text-slate-600 mb-4">
            Aún no hay clientes registrados.
          </p>
          <Link
            href="/clientes/nuevo"
            className="inline-block px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800"
          >
            Agregar el primero
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Sector</th>
                <th className="px-4 py-3 font-medium">Países</th>
                <th className="px-4 py-3 font-medium">Tamaño</th>
                <th className="px-4 py-3 font-medium text-right">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-stone-100 hover:bg-stone-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${c.id}`}
                      className="font-medium text-slate-900 hover:text-teal-700"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.sector ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.countries?.join(", ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.size ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-500 text-xs">
                    {new Date(c.updated_at).toLocaleDateString("es-MX")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
