import { UsersManager } from "@/components/config/UsersManager";

export const dynamic = "force-dynamic";

export default function UsuariosPage() {
  return (
    <div className="px-8 py-6 max-w-5xl mx-auto">
      <p className="text-sm text-slate-500 mb-4">
        Solo estos correos pueden iniciar sesión. Admins ven esta pantalla y
        los catálogos; consultores solo usan el chat y los clientes.
        Agregar a un usuario aquí lo habilita de inmediato — no se le envía
        correo automático, tú le avisas por tu canal habitual.
      </p>
      <UsersManager />
    </div>
  );
}
