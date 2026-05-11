"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientRow } from "@/components/clients/ClientCard";

export function ClientTableRow({ client }: { client: ClientRow }) {
  const router = useRouter();
  // eslint-disable-next-line react-hooks/purity -- timestamp relativo de lista, no requiere reactividad
  const daysAgo = Math.floor((Date.now() - new Date(client.updated_at).getTime()) / 86400000);
  const updatedLabel = daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`;
  const allTags = [
    ...(client.frameworks ?? []).map((f) => ({ label: f, cls: "bg-brand-primary-light text-brand-primary-dark" })),
    ...(client.certifications ?? []).map((f) => ({ label: f, cls: "bg-amber-50 text-amber-700" })),
  ].slice(0, 3);

  return (
    <tr
      className="hover:bg-slate-50/60 group cursor-pointer"
      onClick={() => router.push(`/clientes/${client.id}`)}
    >
      <td className="px-4 py-2.5">
        <span className="font-semibold text-slate-900 group-hover:text-brand-primary-hover transition-colors">
          {client.name}
        </span>
      </td>
      <td className="px-4 py-2.5 text-slate-600 text-xs">
        {client.sector ?? <span className="text-slate-400">—</span>}
        {client.size && <span className="text-slate-400"> · {client.size}</span>}
      </td>
      <td className="px-4 py-2.5 text-slate-600 text-xs">{client.countries?.join(", ") ?? <span className="text-slate-400">—</span>}</td>
      <td className="px-4 py-2.5">
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {allTags.map((t) => (
              <span key={t.label} className={`text-[10px] rounded-sm px-1.5 py-0.5 font-medium ${t.cls}`}>{t.label}</span>
            ))}
          </div>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-slate-500">{updatedLabel}</td>
      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        <Link
          href={`/clientes/${client.id}?tab=chat`}
          title="Chat IA"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded px-2 py-1 hover:bg-brand-primary/20"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Chat
        </Link>
      </td>
    </tr>
  );
}
