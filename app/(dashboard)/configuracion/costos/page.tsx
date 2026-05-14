import type { Metadata } from "next";
import { listServicePricingConfigs } from "@/lib/pricing/config";
import { PricingConfigTable } from "@/components/pricing/PricingConfigTable";

export const metadata: Metadata = {
  title: "Costos · Configuración · App ResponSable",
};

export const revalidate = 3600;

// Etiquetas legibles para las claves del catálogo de servicios
const SERVICE_LABELS: Record<string, string> = {
  doble_materialidad_ia:  "Doble materialidad por IA",
  doble_materialidad:     "Doble materialidad",
  esr:                    "ESR (CEMEFI)",
  informe_sostenibilidad: "Informe de sostenibilidad",
};

export default async function CostosPage() {
  const configs = await listServicePricingConfigs();

  // Armar filas para todos los servicios conocidos, con o sin config guardada
  const rows = Object.entries(SERVICE_LABELS).map(([key, label]) => {
    const saved = configs.find((c) => c.service_key === key);
    return {
      service_key: key,
      label,
      base_cost: saved?.base_cost ?? null,
      notes: saved?.notes ?? null,
      updated_at: saved?.updated_at ?? null,
      updated_by: saved?.updated_by ?? null,
    };
  });

  return (
    <div className="px-8 py-6 max-w-3xl">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Costos base por servicio
      </p>
      <p className="text-sm text-slate-600 mb-1 leading-relaxed">
        Define el costo estimado de cada servicio cuando el proceso ya está
        maduro. Sirve como referencia para fijar precios y detectar cuánto se
        aleja cada proyecto real del objetivo.
      </p>
      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
        Los costos por proyecto individual (costo real, precio de venta,
        estado piloto) se registran directamente en la ficha de cada cliente →
        sección Servicios.
      </p>

      <PricingConfigTable rows={rows} />
    </div>
  );
}
