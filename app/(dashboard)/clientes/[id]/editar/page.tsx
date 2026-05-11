import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClient, getClientEngagements } from "@/lib/clients";
import { requireAdmin } from "@/lib/auth";
import { ClientForm } from "@/components/ClientForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditarClienteFormPage({ params }: Props) {
  const { id } = await params;
  const [client, admin, engagements] = await Promise.all([
    getClient(id).catch(() => null),
    requireAdmin(),
    getClientEngagements(id).catch(() => []),
  ]);

  // Solo admin puede editar. Consultor → volver al detalle.
  if (!admin) redirect(`/clientes/${id}`);
  if (!client) notFound();

  return (
    <div className="px-6 py-4 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-xs text-slate-500">
        <Link href="/clientes" className="hover:text-brand-primary-dark transition-colors font-medium">
          Clientes
        </Link>
        <span className="text-slate-300">/</span>
        <Link href={`/clientes/${id}`} className="hover:text-brand-primary-dark transition-colors font-medium truncate max-w-[200px]">
          {client.name}
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-semibold">Editar</span>
      </div>

      <div className="mb-6">
        <p className="text-xs text-slate-600">
          Edita el perfil del cliente. Los cambios se reflejan de inmediato en el contexto de los roles IA.
        </p>
      </div>

      <ClientForm mode="edit" initial={client} initialEngagements={engagements} />
    </div>
  );
}
