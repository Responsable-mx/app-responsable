import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorOrAdmin } from "@/lib/auth";
import {
  listChatSessions,
  upsertChatSession,
  type ChatSessionMessage,
} from "@/lib/chat-sessions";
import type { RoleId } from "@/lib/ai/models";

const VALID_ROLES = ["aurora", "rebeca", "elena", "valeria"] as const;

const ChatSessionPostSchema = z.object({
  id:       z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  role:     z.enum(VALID_ROLES),
  messages: z.array(z.unknown()),
  title:    z.string().max(200).optional(),
});

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
    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=120" },
    });
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
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ChatSessionPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body inválido" },
      { status: 400 }
    );
  }
  // Sanitizar messages al shape esperado.
  const messages: ChatSessionMessage[] = (parsed.data.messages as Array<Record<string, unknown>>)
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string"
    )
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
      ts: typeof m.ts === "number" ? (m.ts as number) : undefined,
      roleId: (VALID_ROLES as readonly string[]).includes(m.roleId as string)
        ? (m.roleId as RoleId)
        : undefined,
      rating:
        m.rating === "up" || m.rating === "down"
          ? (m.rating as "up" | "down")
          : undefined,
    }));

  try {
    const saved = await upsertChatSession({
      id: parsed.data.id ?? null,
      userEmail: user,
      clientId: parsed.data.clientId ?? null,
      role: parsed.data.role as RoleId,
      messages,
      title: parsed.data.title,
    });
    return NextResponse.json({ data: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
