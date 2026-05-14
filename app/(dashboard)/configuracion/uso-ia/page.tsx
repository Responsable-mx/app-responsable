import { redirect } from "next/navigation";

// Fusionado en /configuracion/monitoreo-ia — ver tab "Métricas detalladas"
export default function UsoIaPage() {
  redirect("/configuracion/monitoreo-ia?tab=metricas");
}
