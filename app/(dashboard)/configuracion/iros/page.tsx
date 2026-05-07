import type { Metadata } from "next";
import { IrosManager } from "@/components/configuracion/IrosManager";

export const metadata: Metadata = { title: "IROs ESRS · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

export default function IrosPage() {
  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-800">IROs ESRS — Doble Materialidad</h2>
        <p className="text-sm text-slate-600 mt-1">
          Los 10 estándares ESRS (E1–E5 Ambiental, S1–S4 Social, G1 Gobernanza) con sus 2 dimensiones
          de análisis por estándar. El benchmark y el reporte de Doble Materialidad IA usan estas
          definiciones como ejes de comparación.
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Los campos del cuestionario vinculados se inyectan automáticamente como contexto en el
          prompt de benchmark, permitiendo que la IA compare al cliente con datos reales de su cuestionario.
        </p>
      </div>
      <IrosManager />
    </div>
  );
}
