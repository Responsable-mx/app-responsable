import { PromptsManager } from "@/components/config/PromptsManager";

export const dynamic = "force-dynamic";

export default function PromptsPage() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">Prompts IA</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Edita las instrucciones que reciben los 4 roles IA. Los prompts de
        sistema (navegación y reglas base) aplican a los 4 por igual; los
        específicos de cada rol determinan su comportamiento único. Cada
        cambio crea una versión restaurable.
      </p>
      <PromptsManager />
    </div>
  );
}
