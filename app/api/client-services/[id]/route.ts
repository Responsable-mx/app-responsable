import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient, requireAdmin } from "@/lib/auth";
import {
  updateClientService,
  updateClientServicePricing,
  deleteClientService,
  getClientService,
} from "@/lib/client-services";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  is_pilot: z.boolean().optional(),
  actual_cost: z.number().nonnegative().nullable().optional(),
  sale_price: z.number().nonnegative().nullable().optional(),
  cost_notes: z.string().max(500).nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const data = await getClientService(id);
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  // Verificar acceso al cliente dueño del servicio (bloquea rol cliente ajeno).
  const user = await requireConsultorForClient(data.client_id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  // D-42: mutaciones de servicios requieren admin
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const user = admin;
  const { id } = await params;

  // D-33: verificar ownership antes de mutar
  const before = await getClientService(id);
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  try {
    const hasPricingFields =
      parsed.data.is_pilot !== undefined ||
      parsed.data.actual_cost !== undefined ||
      parsed.data.sale_price !== undefined ||
      parsed.data.cost_notes !== undefined;

    let updated = before;

    if (parsed.data.data !== undefined) {
      updated = await updateClientService(id, { data: parsed.data.data }, user);
    }

    if (hasPricingFields) {
      updated = await updateClientServicePricing(
        id,
        {
          is_pilot: parsed.data.is_pilot,
          actual_cost: parsed.data.actual_cost,
          sale_price: parsed.data.sale_price,
          cost_notes: parsed.data.cost_notes,
        },
        user
      );
      void logChange({
        actorEmail: user,
        entityType: "client_service_pricing",
        entityId: id,
        action: "update",
        before: {
          is_pilot: before.is_pilot,
          actual_cost: before.actual_cost,
          sale_price: before.sale_price,
        },
        after: {
          is_pilot: updated.is_pilot,
          actual_cost: updated.actual_cost,
          sale_price: updated.sale_price,
        },
      });
    } else {
      // D-36: audit log en mutaciones de datos del servicio
      void logChange({
        actorEmail: user,
        entityType: "client_services",
        entityId: id,
        action: "update",
        before: { service: before.service, client_id: before.client_id },
        after: { service: updated.service, client_id: updated.client_id },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // D-42: mutaciones de servicios requieren admin
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const user = admin;
  const { id } = await params;

  // D-33: verificar ownership antes de borrar
  const before = await getClientService(id);
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    await deleteClientService(id);
    // D-36: audit log en eliminación de servicios
    void logChange({
      actorEmail: user,
      entityType: "client_services",
      entityId: id,
      action: "delete",
      before: { service: before.service, client_id: before.client_id },
      after: null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
