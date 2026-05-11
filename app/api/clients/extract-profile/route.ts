import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevMode } from "@/lib/env";
import { extractProfileFromUrl } from "@/lib/ai/extract-profile";
import { logAiCall } from "@/lib/ai/logging";
import { getTaskConfig } from "@/lib/ai/models";

export const maxDuration = 60;

const ExtractSchema = z.object({ url: z.string().min(1).max(2048) });

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MIN = 5;

async function checkRateLimit(email: string): Promise<boolean> {
  if (isDevMode()) return false;
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
    const { count } = await admin
      .from("chat_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("role", "extract-profile")
      .gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT_MAX) return true;
    await admin.from("chat_requests").insert({ user_email: email, role: "extract-profile", client_id: null });
    return false;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (await checkRateLimit(user))
    return NextResponse.json(
      { error: `Máx ${RATE_LIMIT_MAX} extracciones cada ${RATE_LIMIT_WINDOW_MIN} min.` },
      { status: 429 }
    );

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ExtractSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "url requerida" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const result = await extractProfileFromUrl(parsed.data.url);
    if (!result.cached) {
      const model = getTaskConfig("extract").model;
      void logAiCall({ userEmail: user, role: "aurora", clientId: null, model, inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0, cacheCreationTokens: result.cacheCreationTokens ?? 0, cacheReadTokens: result.cacheReadTokens ?? 0, latencyMs: Date.now() - startedAt, error: null });
    }
    return NextResponse.json({ data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    void logAiCall({ userEmail: user, role: "aurora", clientId: null, model: getTaskConfig("extract").model, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, latencyMs: Date.now() - startedAt, error: msg });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
