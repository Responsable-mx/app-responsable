// Dev preview ChatWindow rediseño enterprise. Solo non-prod (middleware bypass).
import { ChatWindow } from "@/components/chat/ChatWindow";

export const dynamic = "force-static";

const MOCK_CLIENTS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Distribuidora Altamira S.A. de C.V.",
    sector: "Alimentos y Bebidas",
    completeness: { filled: 7, total: 46 },
  },
];

export default function ChatPreviewPage() {
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <ChatWindow clients={MOCK_CLIENTS} initialClientId={MOCK_CLIENTS[0].id} />
    </div>
  );
}
