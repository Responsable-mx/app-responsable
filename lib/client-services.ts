import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceKey } from "@/lib/services/service-schemas";

export type ClientService = {
  id: string;
  client_id: string;
  service: ServiceKey;
  data: Record<string, unknown>;
  is_pilot: boolean;
  actual_cost: number | null;
  sale_price: number | null;
  cost_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientServicePricingPatch = {
  is_pilot?: boolean;
  actual_cost?: number | null;
  sale_price?: number | null;
  cost_notes?: string | null;
};

// ─── Dev-mode fake store (in-memory) ──────────────────────
// Los 2 clientes seed de dev (Heineken, IKEA) ya traen servicios
// asignados para que el mockup sea navegable. Persiste en memoria
// del servidor durante la sesión (se pierde al reiniciar — aceptable
// para mockup).
const DEV_STORE = new Map<string, ClientService[]>();

function seedDevStore() {
  if (DEV_STORE.size > 0) return;
  DEV_STORE.set("dev-heineken", [
    {
      id: "dev-svc-1",
      client_id: "dev-heineken",
      service: "doble_materialidad",
      is_pilot: false,
      actual_cost: null,
      sale_price: null,
      cost_notes: null,
      data: {
        año_estudio: 2024,
        tipo: "Simple (no doble aún)",
        metodologia:
          "Entrevistas con 12 stakeholders internos + encuesta a 47 externos + análisis de prensa 2022-2024",
        marcos_aplicados: ["gri"],
        umbral_priorizacion: "Media 7/10 en eje de impacto",
        proximo_refresh: 2027,
        url_estudio: "",
        notas: "Pendiente actualizar a doble materialidad para CSRD 2026.",
      },
      created_by: "gwenaelle@responsable.net",
      updated_by: "gwenaelle@responsable.net",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
    {
      id: "dev-svc-2",
      client_id: "dev-heineken",
      service: "esr",
      is_pilot: false,
      actual_cost: null,
      sale_price: null,
      cost_notes: null,
      data: {
        año_aplicacion: 2024,
        años_consecutivos: 5,
        puntaje_total: 82,
        subindices: [
          { nombre: "Calidad de vida empresa", puntaje: 90 },
          { nombre: "Ética empresarial", puntaje: 85 },
          { nombre: "Vinculación con comunidad", puntaje: 72 },
          { nombre: "Medio ambiente", puntaje: 81 },
        ],
        areas_brecha: [
          "Vinculación con comunidades locales",
          "Cadena de valor (proveedores)",
        ],
        plan_mejora:
          "Activar mesa trimestral con comunidades Tecate y SLP. Auditoría de proveedores top 20 en Q3.",
        url_constancia: "",
      },
      created_by: "gwenaelle@responsable.net",
      updated_by: "gwenaelle@responsable.net",
      created_at: "2026-03-15T00:00:00Z",
      updated_at: "2026-03-15T00:00:00Z",
    },
    {
      id: "dev-svc-3",
      client_id: "dev-heineken",
      service: "informe_sostenibilidad",
      is_pilot: false,
      actual_cost: null,
      sale_price: null,
      cost_notes: null,
      data: {
        año_cobertura: 2023,
        marco_principal: "gri",
        gri_opcion: "Con referencia a",
        paginas: 47,
        idiomas: ["es", "en"],
        cobertura_geografica: "Operaciones México",
        verificacion_externa: true,
        verificador: "KPMG",
        nivel_aseguramiento: "Limitado",
        url_reporte: "",
        notas: "Informe 2024 en preparación, salida planeada Q3 2026.",
      },
      created_by: "gwenaelle@responsable.net",
      updated_by: "gwenaelle@responsable.net",
      created_at: "2026-02-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
    },
  ]);

  DEV_STORE.set("dev-ikea", [
    {
      id: "dev-svc-4",
      client_id: "dev-ikea",
      service: "esr",
      is_pilot: false,
      actual_cost: null,
      sale_price: null,
      cost_notes: null,
      data: {
        año_aplicacion: 2025,
        años_consecutivos: 1,
        puntaje_total: 68,
        subindices: [
          { nombre: "Calidad de vida empresa", puntaje: 75 },
          { nombre: "Ética empresarial", puntaje: 78 },
          { nombre: "Vinculación con comunidad", puntaje: 55 },
          { nombre: "Medio ambiente", puntaje: 65 },
        ],
        areas_brecha: ["Medio ambiente (medición alcance 3)"],
        plan_mejora: "Primera medición alcance 3 durante 2026.",
      },
      created_by: "elian@responsable.net",
      updated_by: "elian@responsable.net",
      created_at: "2026-01-20T00:00:00Z",
      updated_at: "2026-01-20T00:00:00Z",
    },
  ]);
}

export async function listClientServices(
  clientId: string
): Promise<ClientService[]> {
  if (isDevMode()) {
    seedDevStore();
    return DEV_STORE.get(clientId) ?? [];
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_services")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[client-services] list:", error.message);
    return [];
  }
  return (data ?? []) as ClientService[];
}

export async function getClientService(
  id: string
): Promise<ClientService | null> {
  if (isDevMode()) {
    seedDevStore();
    for (const list of DEV_STORE.values()) {
      const found = list.find((s) => s.id === id);
      if (found) return found;
    }
    return null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_services")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[client-services] get:", error.message);
    return null;
  }
  return data as ClientService | null;
}

export async function createClientService(
  input: {
    client_id: string;
    service: ServiceKey;
    data: Record<string, unknown>;
  },
  createdBy: string
): Promise<ClientService> {
  if (isDevMode()) {
    seedDevStore();
    const newSvc: ClientService = {
      id: `dev-svc-${Date.now()}`,
      client_id: input.client_id,
      service: input.service,
      data: input.data,
      is_pilot: false,
      actual_cost: null,
      sale_price: null,
      cost_notes: null,
      created_by: createdBy,
      updated_by: createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const list = DEV_STORE.get(input.client_id) ?? [];
    DEV_STORE.set(input.client_id, [newSvc, ...list]);
    return newSvc;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_services")
    .insert({
      client_id: input.client_id,
      service: input.service,
      data: input.data,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createClientService: ${error.message}`);
  return data as ClientService;
}

export async function updateClientService(
  id: string,
  patch: { data: Record<string, unknown> },
  updatedBy: string
): Promise<ClientService> {
  if (isDevMode()) {
    seedDevStore();
    for (const [clientId, list] of DEV_STORE.entries()) {
      const idx = list.findIndex((s) => s.id === id);
      if (idx >= 0) {
        const updated: ClientService = {
          ...list[idx]!,
          data: patch.data,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        };
        const newList = [...list];
        newList[idx] = updated;
        DEV_STORE.set(clientId, newList);
        return updated;
      }
    }
    throw new Error("Servicio no encontrado (dev mode)");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_services")
    .update({
      data: patch.data,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateClientService: ${error.message}`);
  return data as ClientService;
}

export async function updateClientServicePricing(
  id: string,
  patch: ClientServicePricingPatch,
  updatedBy: string
): Promise<ClientService> {
  if (isDevMode()) {
    seedDevStore();
    for (const [clientId, list] of DEV_STORE.entries()) {
      const idx = list.findIndex((s) => s.id === id);
      if (idx >= 0) {
        const updated: ClientService = {
          ...list[idx]!,
          ...patch,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        };
        const newList = [...list];
        newList[idx] = updated;
        DEV_STORE.set(clientId, newList);
        return updated;
      }
    }
    throw new Error("Servicio no encontrado (dev mode)");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_services")
    .update({
      ...patch,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateClientServicePricing: ${error.message}`);
  return data as ClientService;
}

export async function deleteClientService(id: string): Promise<void> {
  if (isDevMode()) {
    seedDevStore();
    for (const [clientId, list] of DEV_STORE.entries()) {
      const filtered = list.filter((s) => s.id !== id);
      if (filtered.length !== list.length) {
        DEV_STORE.set(clientId, filtered);
        return;
      }
    }
    return;
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("client_services")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`deleteClientService: ${error.message}`);
}
