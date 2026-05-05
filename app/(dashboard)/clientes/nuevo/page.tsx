import Link from "next/link";
import { NuevoClienteWizard } from "@/components/NuevoClienteWizard";

export default function NuevoClientePage() {
  return (
    <div className="px-6 py-4 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-primary-hover transition-colors font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Clientes
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-bold text-slate-900">Nuevo cliente</span>
      </div>

      {/* Header */}
      <div className="mb-5 pb-4 border-b border-slate-200">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
          Cliente · Nuevo · Wizard paso 1 de 9
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Agregar cliente</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Captura inicial mínima. La IA llenará el resto del cuestionario con datos públicos verificables.
        </p>
      </div>

      <NuevoClienteWizard />
    </div>
  );
}
