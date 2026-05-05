import { notFound } from "next/navigation";
import { getClient, clientContextCompleteness } from "@/lib/clients";
import { ClientTabs } from "@/components/ClientTabs";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id).catch(() => null);
  if (!client) notFound();

  const completeness = clientContextCompleteness(client);
  const meta = [client.sector, client.subsector, client.size]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header corporate */}
      <div className="mb-5 pb-4 border-b border-slate-200">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
          Cliente · Detalle
        </p>
        <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
        {meta && <p className="text-sm text-slate-600 mt-0.5">{meta}</p>}
      </div>

      <ClientTabs client={client} completeness={completeness} />
    </div>
  );
}
