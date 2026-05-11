import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { countActiveFeedback } from "@/lib/ai/feedback-memory";

export const maxDuration = 5;

// GET /api/ia-feedback/count?role=aurora&client_id=<uuid>
// Cuenta rechazos vigentes para mostrar badge "memoria IA: N rechazos" en chat.
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const clientId = url.searchParams.get("client_id");

  if (!role || !["aurora", "rebeca", "elena", "valeria"].includes(role)) {
    return NextResponse.json({ error: "role inválido" }, { status: 400 });
  }

  const count = await countActiveFeedback({
    role,
    clientId: clientId && /^[0-9a-f-]{36}$/i.test(clientId) ? clientId : null,
  });

  return NextResponse.json({ data: { count } });
}
