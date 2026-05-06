import { NextRequest, NextResponse } from "next/server";
import { requireConsultorOrAdmin } from "@/lib/auth";
import {
  listChatSessions,
  upsertChatSession,
  type ChatSessionMessage,
} from "@/lib/chat-sessions";
import type { RoleId } from "@/lib/ai/models";

const VALID_ROLES: RoleId[] = ["aurora", "rebeca", "elena", "valeria"];

export async function GET(req: NextRequest) {
  const user = await requireConsultorOrAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const clientIdParam = url.searchParams.get("clientId");
  const filter: { clientId?: string | null } = {};
  if (clientIdParam === "null") filter.clientId = null;
  else if (clientIdParam) filter.clientId = clientIdParam;
  try {
    const data = await listChatSessions(user, filter);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await requireConsultorOrAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let body: {
    id?: string;
    clientId?: string | null;
    role?: string;
    messages?: unknown;
    title?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.role || !VALID_ROLES.includes(body.role as RoleId)) {
    return NextResponse.json({ error: "role inválido" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages debe ser array" }, { status: 400 });
  }
  // Sanitizar messages al shape esperado.
  const messages: ChatSessionMessage[] = (body.messages as Array<Record<string, unknown>>)
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    )
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
      ts: typeof m.ts === "number" ? (m.ts as number) : undefined,
      roleId: VALID_ROLES.includes(m.roleId as RoleId)
        ? (m.roleId as RoleId)
        : undefined,
      rating:
        m.rating === "up" || m.rating === "down"
          ? (m.rating as "up" | "down")
          : undefined,
    }));

  try {
    const saved = await upsertChatSession({
      id: body.id ?? null,
      userEmail: user,
      clientId: body.clientId ?? null,
      role: body.role as RoleId,
      messages,
      title: body.title,
    });
    return NextResponse.json({ data: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
