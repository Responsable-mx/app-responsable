import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  listServicePricingConfigs,
  upsertServicePricingConfig,
} from "@/lib/pricing/config";
import { logChange } from "@/lib/audit-log";

const UpsertSchema = z.object({
  service_key: z.string().min(1).max(100),
  base_cost: z.number().nonnegative().nullable(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const data = await listServicePricingConfigs();
  return NextResponse.json({ data }, {
    headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=7200" },
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = UpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  try {
    const result = await upsertServicePricingConfig(
      {
        service_key: parsed.data.service_key,
        base_cost: parsed.data.base_cost,
        notes: parsed.data.notes ?? null,
      },
      admin
    );
    void logChange({
      actorEmail: admin,
      entityType: "service_pricing_config",
      entityId: result.service_key,
      action: "update",
      before: null,
      after: { base_cost: result.base_cost, notes: result.notes },
    });
    return NextResponse.json({ data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
