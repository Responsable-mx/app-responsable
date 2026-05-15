export type ToolHealthStatus = "ok" | "error" | "inactive";
export type ToolHealth = { status: ToolHealthStatus; message?: string };
export type ToolHealthSummaryItem = { key: string; name: string; status: ToolHealthStatus };

export const TOOL_HEALTH_CHECKS: Record<string, () => Promise<ToolHealth>> = {
  voyage: async () => {
    const key = process.env.VOYAGE_API_KEY;
    if (!key) return { status: "inactive" };
    try {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.VOYAGE_MODEL ?? "voyage-3", input: ["ping"], input_type: "document" }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { status: "ok" };
      if (res.status === 401) return { status: "error", message: "API key inválida o revocada" };
      if (res.status === 429) return { status: "error", message: "Cuota agotada — límite de requests alcanzado" };
      return { status: "error", message: `Error inesperado del servicio (HTTP ${res.status})` };
    } catch {
      return { status: "error", message: "No se pudo contactar Voyage AI — revisa conexión o estado del servicio" };
    }
  },

  llama: async () => {
    const key = process.env.LLAMA_CLOUD_API_KEY;
    if (!key) return { status: "inactive" };
    try {
      const res = await fetch("https://api.cloud.llamaindex.ai/api/parsing/usage", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok || res.status === 404) return { status: "ok" };
      if (res.status === 401 || res.status === 403) return { status: "error", message: "API key inválida o créditos agotados" };
      if (res.status === 402) return { status: "error", message: "Créditos agotados — recarga en cloud.llamaindex.ai" };
      return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
    } catch {
      return { status: "error", message: "No se pudo contactar LlamaParse — revisa conexión o estado del servicio" };
    }
  },

  mistral: async () => {
    const key = process.env.MISTRAL_API_KEY;
    if (!key) return { status: "inactive" };
    try {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { status: "ok" };
      if (res.status === 401) return { status: "error", message: "API key inválida o revocada" };
      if (res.status === 429) return { status: "error", message: "Cuota de requests agotada" };
      return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
    } catch {
      return { status: "error", message: "No se pudo contactar Mistral — revisa conexión o estado del servicio" };
    }
  },

  qstash: async () => {
    const token = process.env.QSTASH_TOKEN;
    if (!token) return { status: "inactive" };
    try {
      const base = (process.env.QSTASH_URL ?? "https://qstash.upstash.io").replace(/\/$/, "");
      const res = await fetch(`${base}/v2/schedules`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { status: "ok" };
      if (res.status === 401) return { status: "error", message: "Token inválido o revocado" };
      if (res.status === 403) return { status: "error", message: "Sin permisos — verifica el token en console.upstash.com" };
      return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
    } catch {
      return { status: "error", message: "No se pudo contactar QStash — revisa conexión o estado del servicio" };
    }
  },

  batch: async () =>
    process.env.ANTHROPIC_API_KEY ? { status: "ok" } : { status: "inactive" },

  gemini: async () => {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) return { status: "inactive" };
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash?key=${key}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) return { status: "ok" };
      if (res.status === 400 || res.status === 403) return { status: "error", message: "API key inválida o sin acceso a Gemini" };
      if (res.status === 429) return { status: "error", message: "Cuota agotada" };
      return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
    } catch {
      return { status: "error", message: "No se pudo contactar Google AI — revisa la key" };
    }
  },

  redis: async () => {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return { status: "inactive" };
    try {
      const res = await fetch(`${url}/ping`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { status: "ok" };
      if (res.status === 401) return { status: "error", message: "Token inválido o revocado" };
      return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
    } catch {
      return { status: "error", message: "No se pudo contactar Upstash Redis — revisa la URL o el token" };
    }
  },
};

const TOOL_NAMES: Record<string, string> = {
  voyage:  "Voyage AI",
  llama:   "LlamaParse",
  mistral: "Mistral OCR",
  qstash:  "QStash",
  batch:   "Batch API",
  gemini:  "Gemini Flash",
  redis:   "Redis",
};

/** Corre todos los health checks en paralelo. Retorna resumen por herramienta. */
export async function getToolsHealthSummary(): Promise<ToolHealthSummaryItem[]> {
  const entries = Object.entries(TOOL_HEALTH_CHECKS);
  const results = await Promise.all(
    entries.map(async ([key, check]) => {
      const { status } = await check().catch(() => ({ status: "error" as ToolHealthStatus }));
      return { key, name: TOOL_NAMES[key] ?? key, status };
    })
  );
  return results;
}
