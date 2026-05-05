import { redirect } from "next/navigation";

// Plantillas de servicio ahora viven en /configuracion/plantillas (TemplatesManager completo).
export default function ServiciosPage() {
  redirect("/configuracion/plantillas");
}
