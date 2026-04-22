import { UsersManager } from "@/components/config/UsersManager";

export const dynamic = "force-dynamic";

export default function UsuariosPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">Usuarios autorizados</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Solo estos correos pueden iniciar sesión. Admins ven esta pantalla y
        los catálogos; consultores solo usan el chat y los clientes.
        Agregar a un usuario aquí lo habilita de inmediato — no se le envía
        correo automático, tú le avisas por tu canal habitual.
      </p>
      <UsersManager />
    </div>
  );
}
