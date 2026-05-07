import type { Metadata } from "next";
import { UsersManager } from "@/components/config/UsersManager";

export const metadata: Metadata = { title: "Usuarios · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

export default function UsuariosPage() {
  return (
    <div className="px-8 py-6 max-w-5xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Usuarios autorizados para acceder a la app. Admins gestionan configuración;
        consultores solo tienen acceso al chat y clientes.{" "}
        <span title="Al agregar un usuario se habilita de inmediato — no se envía correo automático, tú le avisas por tu canal habitual." className="underline decoration-dotted cursor-help text-slate-500">
          ¿Cómo funciona?
        </span>
      </p>
      <UsersManager />
    </div>
  );
}
