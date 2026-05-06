import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigTabs } from "@/components/config/ConfigTabs";
import { ConfigSWRProvider } from "@/components/config/ConfigSWRProvider";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Configuración · App ResponSable" };

// D-59: Layout async para re-verificar rol admin desde DB (no JWT).
// El middleware usa user_metadata.role del JWT (stale hasta próximo login).
// Este check garantiza que un admin degradado no vea /configuracion aunque
// su JWT siga diciendo "admin". requireAdmin() consulta authorized_users en DB.
export default async function ConfigLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  return (
    <ConfigSWRProvider>
      <div className="flex flex-col h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-8 pt-6 pb-5">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-lg font-bold text-slate-900">Configuración</h1>
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden max-w-6xl w-full mx-auto">
          {/* Sidebar nav */}
          <aside className="w-48 shrink-0 border-r border-slate-200 bg-white px-3 py-4 overflow-y-auto">
            <ConfigTabs />
          </aside>
          {/* Content */}
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ConfigSWRProvider>
  );
}
