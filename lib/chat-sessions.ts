import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoleId } from "@/lib/ai/models";
// D-11 — NOTA DE SEGURIDAD: chat_sessions usa createAdminClient() (service role).
// Las políticas RLS de la migración 0028 definen permisos para clientes Supabase
// autenticados, pero service role las bypassa. El aislamiento por usuario se
// garantiza aquí, en código, mediante los filtros .eq("user_email", userEmail).
// Si un endpoint omite ese filtro, la fila es accesible a cualquier usuario.
// Patrón deliberado: consistente con el resto de la app (clients, prompts, etc.).
// Alternativa futura: migrar a Supabase client autenticado con JWT del usuario.

export type ChatSessionMessage = {
  role: "user" | "assistant";
  content: string;
  ts?: number;
  roleId?: RoleId;
  rating?: "up" | "down";
};

export type ChatSession = {
  id: string;
  user_email: string;
  client_id: string | null;
  role: RoleId;
  title: string;
  messages: ChatSessionMessage[];
  message_count: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatSessionListItem = Pick<
  ChatSession,
  "id" | "client_id" | "role" | "title" | "message_count" | "updated_at"
>;

export async function listChatSessions(
  userEmail: string,
  filter?: { clientId?: string | null; limit?: number }
): Promise<ChatSessionListItem[]> {
  if (isDevMode()) return [];
  const supabase = createAdminClient();
  let q = supabase
    .from("chat_sessions")
    .select("id, client_id, role, title, message_count, updated_at")
    .eq("user_email", userEmail)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(filter?.limit ?? 50);
  if (filter?.clientId !== undefined) {
    if (filter.clientId === null) {
      q = q.is("client_id", null);
    } else {
      q = q.eq("client_id", filter.clientId);
    }
  }
  const { data, error } = await q;
  if (error) throw new Error(`listChatSessions: ${error.message}`);
  return (data ?? []) as ChatSessionListItem[];
}

export async function getChatSession(
  id: string,
  userEmail: string
): Promise<ChatSession | null> {
  if (isDevMode()) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_email", userEmail)
    .maybeSingle();
  if (error) throw new Error(`getChatSession: ${error.message}`);
  return (data as ChatSession | null) ?? null;
}

// D-25: tope de mensajes por sesión. Sin límite, una conversación larga con respuestas
// de 4096 tokens puede crecer a 200KB+ por autosave (cada 800ms de debounce).
// Conservamos los últimos MAX_MESSAGES_PER_SESSION para mantener payload manejable.
const MAX_MESSAGES_PER_SESSION = 200;

export async function upsertChatSession(opts: {
  id?: string | null;
  userEmail: string;
  clientId: string | null;
  role: RoleId;
  messages: ChatSessionMessage[];
  title?: string;
}): Promise<ChatSession> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const supabase = createAdminClient();

  // D-25: truncar al máximo para evitar payloads masivos en sesiones largas.
  const messages =
    opts.messages.length > MAX_MESSAGES_PER_SESSION
      ? opts.messages.slice(-MAX_MESSAGES_PER_SESSION)
      : opts.messages;

  // Inferir título de la primera pregunta del usuario si no viene explícito.
  const computedTitle =
    opts.title ??
    (() => {
      const firstUser = opts.messages.find((m) => m.role === "user");
      const text = firstUser?.content?.trim() ?? "Conversación sin título";
      return text.length > 60 ? text.slice(0, 57) + "…" : text;
    })();

  if (opts.id) {
    const { data, error } = await supabase
      .from("chat_sessions")
      .update({
        messages, // ya truncado a MAX_MESSAGES_PER_SESSION
        message_count: messages.length,
        title: computedTitle,
      })
      .eq("id", opts.id)
      .eq("user_email", opts.userEmail)
      .select()
      .single();
    if (error) throw new Error(`upsertChatSession update: ${error.message}`);
    return data as ChatSession;
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      user_email: opts.userEmail,
      client_id: opts.clientId,
      role: opts.role,
      title: computedTitle,
      messages, // ya truncado
      message_count: messages.length,
    })
    .select()
    .single();
  if (error) throw new Error(`upsertChatSession insert: ${error.message}`);
  return data as ChatSession;
}

export async function renameChatSession(
  id: string,
  userEmail: string,
  title: string
): Promise<void> {
  if (isDevMode()) return;
  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) throw new Error("El título no puede estar vacío.");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ title: trimmed })
    .eq("id", id)
    .eq("user_email", userEmail);
  if (error) throw new Error(`renameChatSession: ${error.message}`);
}

export async function archiveChatSession(
  id: string,
  userEmail: string
): Promise<void> {
  if (isDevMode()) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_email", userEmail);
  if (error) throw new Error(`archiveChatSession: ${error.message}`);
}
