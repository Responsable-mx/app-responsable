import { ClientForm } from "@/components/ClientForm";

export default function NuevoClientePage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">
        Agregar cliente
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Llena lo que tengas hoy. Los 6 bloques alimentan a los 4 roles IA —
        entre más completo, mejor responden Aurora, Rebeca, Elena y Valeria.
      </p>
      <ClientForm mode="create" />
    </div>
  );
}
