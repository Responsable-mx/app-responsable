import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevMode } from "@/lib/env";
import {
  extractSectorFromUrl,
  extractSectorFromTranscript,
} from "@/lib/ai/extract-test";

export const maxDuration = 60;

// Rate limit: reusa tabla chat_requests existente.
// 20 extracciones / 5 min por usuario (más estricto que chat).
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MIN = 5;

async function checkRateLimit(email: string): Promise<boolean> {
  if (isDevMode()) return false;
  try {
    const admin = createAdminClient();
    const since = new Date(
      Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000
    ).toISOString();
    const { count } = await admin
      .from("chat_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("role", "extract-test")
      .gte("created_at", since);
    const used = count ?? 0;
    if (used >= RATE_LIMIT_MAX) return true;
    await admin.from("chat_requests").insert({
      user_email: email,
      role: "extract-test",
      client_id: null,
    });
    return false;
  } catch (e) {
    console.error("[extract-test rate limit]", e);
    return false; // falla abierta
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { source?: "url" | "text"; url?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (await checkRateLimit(user)) {
    return NextResponse.json(
      {
        error: `Máx ${RATE_LIMIT_MAX} extracciones cada ${RATE_LIMIT_WINDOW_MIN} min. Espera un momento.`,
      },
      { status: 429 }
    );
  }

  try {
    if (body.source === "url") {
      if (!body.url || typeof body.url !== "string") {
        return NextResponse.json({ error: "URL requerida" }, { status: 400 });
      }
      const result = await extractSectorFromUrl(body.url);
      return NextResponse.json({ data: result });
    }
    if (body.source === "text") {
      if (!body.text || typeof body.text !== "string") {
        return NextResponse.json(
          { error: "Transcripción requerida" },
          { status: 400 }
        );
      }
      const result = await extractSectorFromTranscript(body.text);
      return NextResponse.json({ data: result });
    }
    return NextResponse.json(
      { error: "source debe ser 'url' o 'text'" },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[POST /api/extract-test]", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
