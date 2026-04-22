import { listClients, clientContextCompleteness } from "@/lib/clients";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { GuidedTour } from "@/components/GuidedTour";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const clients = await listClients().catch(() => []);
  // Dropdown de cliente en chat: orden alfabético por nombre (es-MX).
  const sorted = [...clients].sort((a, b) =>
    a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" })
  );
  return (
    <div className="h-screen flex flex-col">
      <GuidedTour />
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
