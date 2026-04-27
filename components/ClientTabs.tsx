"use client";

import { useState } from "react";
import type { Client } from "@/lib/clients";
import { ClientForm } from "@/components/ClientForm";
import { ClientServicesTab } from "@/components/services/ClientServicesTab";

type Tab = "contexto" | "servicios";

export function ClientTabs({ client }: { client: Client }) {
  const [tab, setTab] = useState<Tab>("contexto");

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-stone-200 mb-6">
        <TabButton
          active={tab === "contexto"}
          onClick={() => setTab("contexto")}
          label="Contexto"
          hint="Quién es el cliente"
        />
        <TabButton
          active={tab === "servicios"}
          onClick={() => setTab("servicios")}
          label="Servicios"
          hint="Qué le estamos haciendo"
        />
      </div>

      {tab === "contexto" && <ClientForm mode="edit" initial={client} />}
      {tab === "servicios" && <ClientServicesTab clientId={client.id} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? "border-brand-primary-hover text-brand-primary-dark font-medium"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
      <span className="block text-[10px] text-slate-600 font-normal mt-0.5">
        {hint}
      </span>
    </button>
  );
}
