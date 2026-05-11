import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 10;

// Captura feedback explícito de consultores sobre respuestas IA.
// Wave 3c (D): los registros con rating=down + reason se inyectan después
// como ejemplos "a evitar" en futuros system prompts del mismo rol.

const FeedbackSchema = z.object({
  role: z.enum(["aurora", "rebeca", "elena", "valeria"]),
  client_id: z.string().uuid().nullable().optional(),
  session_id: z.string().uuid().nullable().optional(),
  message_excerpt: z.string().min(1).max(500),
  rating: z.enum(["up", "down"]),
  reason_code: z
    .enum([
      "factually_wrong",
      "sector_off",
      "bad_format",
      "language",
      "too_generic",
      "missed_context",
      "other",
    ])
    .nullable()
    .optional(),
  reason_text: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación falló", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ia_feedback")
    .insert({
      user_email: user,
      role: parsed.data.role,
      client_id: parsed.data.client_id ?? null,
      session_id: parsed.data.session_id ?? null,
      message_excerpt: parsed.data.message_excerpt.slice(0, 500),
      rating: parsed.data.rating,
      reason_code: parsed.data.reason_code ?? null,
      reason_text: parsed.data.reason_text ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ia-feedback] insert failed:", error.message);
    return NextResponse.json({ error: "Error al guardar feedback" }, { status: 500 });
  }

  return NextResponse.json({ data: { id: data.id } });
}
