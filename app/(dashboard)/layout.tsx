import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { getUserRoles } from "@/lib/users";
import { ToastProvider } from "@/components/ui/Toast";
import { CommandPalette } from "@/components/CommandPalette";
import { DashboardSWRProvider } from "@/components/DashboardSWRProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await requireUser();
  const { isAdmin: admin, isClient: client, clientId } = email
    ? await getUserRoles(email)
    : { isAdmin: false, isClient: false, clientId: null };

  return (
    <ToastProvider>
      <DashboardSWRProvider>
        <div className="h-screen bg-slate-50 flex overflow-hidden">
          <Sidebar
            isAdmin={admin}
            isClient={client}
            clientId={clientId}
            userEmail={email}
          />
          <main id="main-content" className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        {/* CommandPalette lista todos los clientes — ocultar para usuarios cliente */}
        {!client && <CommandPalette />}
      </DashboardSWRProvider>
    </ToastProvider>
  );
}
