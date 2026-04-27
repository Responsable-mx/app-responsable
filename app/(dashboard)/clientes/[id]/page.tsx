import { notFound } from "next/navigation";
import { getClient } from "@/lib/clients";
import { ClientTabs } from "@/components/ClientTabs";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id).catch(() => null);
  if (!client) notFound();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{client.name}</h1>
      <p className="text-sm text-slate-600 mb-4">
        {client.sector ?? "—"}
        {client.subsector && ` · ${client.subsector}`}
        {client.size && ` · ${client.size}`}
      </p>
      <ClientTabs client={client} />
    </div>
  );
}
