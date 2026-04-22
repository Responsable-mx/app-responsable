import { listClients, clientContextCompleteness } from "@/lib/clients";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { GuidedTour } from "@/components/GuidedTour";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const clients = await listClients().catch(() => []);
  return (
    <div className="h-screen flex flex-col">
      <GuidedTour />
      <ChatWindow
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          sector: c.sector,
          completeness: clientContextCompleteness(c),
        }))}
      />
    </div>
  );
}
