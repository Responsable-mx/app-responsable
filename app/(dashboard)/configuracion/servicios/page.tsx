import { ServiceTemplatesManager } from "@/components/config/ServiceTemplatesManager";

export default function ServiciosPage() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-6">
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-1">
          Plantillas de servicio
        </h2>
        <p className="text-xs text-slate-600 max-w-xl">
          Plantillas reutilizables de etapas y actividades. Se crean desde el cronograma
          de un cliente y se aplican a otros proyectos desde el mismo cronograma.
        </p>
      </div>
      <ServiceTemplatesManager />
    </div>
  );
}
