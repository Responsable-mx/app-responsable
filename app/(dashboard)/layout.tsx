import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { isAdmin, isClient, getUserClientId } from "@/lib/users";
import { ToastProvider } from "@/components/ui/Toast";
import { CommandPalette } from "@/components/CommandPalette";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await requireUser();
  const [admin, client] = await Promise.all([
    email ? isAdmin(email) : Promise.resolve(false),
    email ? isClient(email) : Promise.resolve(false),
  ]);
  const clientId = client && email ? await getUserClientId(email) : null;

  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}
