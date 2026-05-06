import type { Metadata } from "next";
import { TemplatesManager } from "@/components/config/TemplatesManager";

export const metadata: Metadata = { title: "Plantillas · Configuración · App ResponSable" };

export const dynamic = "force-dynamic";

export default function PlantillasPage() {
  return (
    <div className="px-8 py-6 max-w-5xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Plantillas reutilizables de etapas y actividades. Para crear una nueva, ve a la
        ficha de un cliente con cronograma armado y usa &quot;Guardar como plantilla&quot;.
        Aquí puedes editar metadata o eliminar.
      </p>
      <TemplatesManager />
    </div>
  );
}
