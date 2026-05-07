import type { Metadata } from "next";
import { listClients, clientContextCompleteness } from "@/lib/clients";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { GuidedTour } from "@/components/GuidedTour";
import { requireUser } from "@/lib/auth";
import { getUserRoles } from "@/lib/users";

export const metadata: Metadata = { title: "Chat IA · App ResponSable" };

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const email = await requireUser();
  const [clients, { isAdmin: admin }] = await Promise.all([
    listClients().catch(() => []),
    email ? getUserRoles(email) : Promise.resolve({ isAdmin: false, isClient: false, clientId: null }),
  ]);
  // Dropdown de cliente en chat: orden alfabético por nombre (es-MX).
  const sorted = [...clients].sort((a, b) =>
    a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" })
  );
  return (
    <div className="h-screen flex flex-col">
      <GuidedTour isAdmin={admin} />
      <ChatWindow
        clients={sorted.map((c) => ({
          id: c.id,
          name: c.name,
          sector: c.sector,
          completeness: clientContextCompleteness(c),
        }))}
      />
    </div>
  );
}
