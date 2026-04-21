import { notFound } from "next/navigation";
import { getClient } from "@/lib/clients";
import { ClientForm } from "@/components/ClientForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id).catch(() => null);
  if (!client) notFound();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{client.name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        Editar contexto del cliente. Los cambios aplican a las próximas
        conversaciones con los 4 roles.
      </p>
      <ClientForm mode="edit" initial={client} />
    </div>
  );
}
