import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Cron daily-qa — corre cada mañana (ver vercel.json).
 * Checa endpoints críticos y tablas base. Solo reporta FALLOS.
 *
 * Inspirado en daily-qa de S-Peak App: silencio = todo bien.
 */
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const failures: Array<{ check: string; detail: string }> = [];
  const admin = createAdminClient();

  // ── Check 1: clients table accesible
  try {
    const { error } = await admin
      .from("clients")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) failures.push({ check: "clients_table", detail: error.message });
  } catch (e) {
    failures.push({ check: "clients_table", detail: String(e) });
  }

  // ── Check 2: access_codes accesible (OTP flow operativo)
  try {
    const { error } = await admin
      .from("access_codes")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) failures.push({ check: "access_codes_table", detail: error.message });
  } catch (e) {
    failures.push({ check: "access_codes_table", detail: String(e) });
  }

  // ── Check 3: ai_calls accesible (observabilidad operativa)
  try {
    const { error } = await admin
      .from("ai_calls")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) failures.push({ check: "ai_calls_table", detail: error.message });
  } catch (e) {
    failures.push({ check: "ai_calls_table", detail: String(e) });
  }

  // ── Check 4: Anthropic API key presente
  if (!process.env.ANTHROPIC_API_KEY) {
    failures.push({
      check: "anthropic_key",
      detail: "ANTHROPIC_API_KEY missing",
    });
  }

  // ── Check 5: Resend key presente
  if (!process.env.RESEND_API_KEY) {
    failures.push({
      check: "resend_key",
      detail: "RESEND_API_KEY missing (OTP emails won't send)",
    });
  }

  if (failures.length > 0) {
    console.error("[cron/daily-qa] FAILURES", JSON.stringify(failures));
    return NextResponse.json({ ok: false, failures });
  }

  return NextResponse.json({ ok: true });
}
