import type { Metadata } from "next";
import { PromptsManager } from "@/components/config/PromptsManager";

export const metadata: Metadata = { title: "Prompts IA · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

export default function PromptsPage() {
  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Edita las instrucciones que reciben los 4 roles IA. Los prompts de
        sistema (navegación y reglas base) aplican a los 4 por igual; los
        específicos de cada rol determinan su comportamiento único. Cada
        cambio crea una versión restaurable.
      </p>
      <PromptsManager />
    </div>
  );
}
