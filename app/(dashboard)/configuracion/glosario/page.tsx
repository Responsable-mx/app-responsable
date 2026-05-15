import type { Metadata } from "next";
import { GlosarioManager } from "@/components/config/GlosarioManager";

export const metadata: Metadata = { title: "Glosario · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

export default function GlosarioPage() {
  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <GlosarioManager />
    </div>
  );
}
