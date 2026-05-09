import type { Metadata } from "next";
import { PromptsManager } from "@/components/config/PromptsManager";

export const metadata: Metadata = { title: "Prompts IA · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

export default function PromptsPage() {
  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Edita los prompts que controlan el comportamiento de cada asistente IA.
        Los prompts de sistema son comunes a todos; los de rol y módulo son
        específicos a cada uno. Cada cambio crea una versión restaurable.
      </p>
      <PromptsManager />
    </div>
  );
}
