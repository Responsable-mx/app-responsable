import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/users";
import { ToastProvider } from "@/components/ui/Toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await requireUser();
  const admin = email ? await isAdmin(email) : false;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-stone-50 flex">
        <Sidebar isAdmin={admin} />
        <main id="main-content" className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
