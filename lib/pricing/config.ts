import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type ServicePricingConfig = {
  service_key: string;
  base_cost: number | null;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

const DEV_PRICING: ServicePricingConfig[] = [
  {
    service_key: "doble_materialidad_ia",
    base_cost: 45000,
    notes: "Incluye 4 etapas: contexto, benchmark, reporte, IROs.",
    updated_at: new Date().toISOString(),
    updated_by: "gwenaelle@responsable.net",
  },
  {
    service_key: "doble_materialidad",
    base_cost: 25000,
    notes: null,
    updated_at: new Date().toISOString(),
    updated_by: null,
  },
];

export async function listServicePricingConfigs(): Promise<ServicePricingConfig[]> {
  if (isDevMode()) return DEV_PRICING;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("service_pricing_config")
    .select("*")
    .order("service_key");
  if (error) {
    console.error("[pricing] list:", error.message);
    return [];
  }
  return (data ?? []) as ServicePricingConfig[];
}

export async function getServicePricingConfig(
  serviceKey: string
): Promise<ServicePricingConfig | null> {
  if (isDevMode()) {
    return DEV_PRICING.find((p) => p.service_key === serviceKey) ?? null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("service_pricing_config")
    .select("*")
    .eq("service_key", serviceKey)
    .maybeSingle();
  if (error) {
    console.error("[pricing] get:", error.message);
    return null;
  }
  return data as ServicePricingConfig | null;
}

export async function upsertServicePricingConfig(
  input: { service_key: string; base_cost: number | null; notes: string | null },
  updatedBy: string
): Promise<ServicePricingConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("service_pricing_config")
    .upsert(
      {
        service_key: input.service_key,
        base_cost: input.base_cost,
        notes: input.notes,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "service_key" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertServicePricingConfig: ${error.message}`);
  return data as ServicePricingConfig;
}
