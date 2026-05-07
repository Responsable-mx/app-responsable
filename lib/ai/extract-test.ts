import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { z } from "zod";
import { listCatalog } from "@/lib/catalogs";

// ═══════════════════════════════════════════════════════════════
// POC de extracción IA. Por ahora solo campo 'sector'.
// 2 fuentes: URL (fetch + strip HTML) o transcripción pegada.
// Cache in-memory 30 min por hash SHA-256 del input normalizado.
// ═══════════════════════════════════════════════════════════════

const MODEL = process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-6";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_CHARS = 15_000; // lo que llega al prompt

export type ExtractResult = {
  value: string | null;         // canonical value del catálogo sectors o null si no pudo
  label: string | null;         // label legible
  confidence: number;           // 0-1
  excerpt: string | null;       // cita textual del input que usó para decidir
  reasoning: string;            // breve explicación
  input_preview: string;        // primeros 500 chars del texto analizado (audit)
  cached: boolean;
};

// ── Cache in-memory (30 min TTL) ────────────────────────────
type CacheEntry = { result: ExtractResult; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function hashKey(kind: "url" | "text", content: string): string {
  const normalized = content.trim().toLowerCase();
  return `${kind}:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

function getCached(key: string): ExtractResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setCached(key: string, result: ExtractResult): void {
  cache.set(key, {
    result: { ...result, cached: false },
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  // GC básico: si el cache crece más de 500 entradas, tirar las más viejas
  if (cache.size > 500) {
    const oldest = [...cache.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, 100);
    for (const [k] of oldest) cache.delete(k);
  }
}

// ── Anti-SSRF: validación de URL ────────────────────────────
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254", // AWS/GCP metadata
]);

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Solo se permite http o https");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error("Hostname bloqueado por seguridad");
  }
  if (isPrivateIPv4(host)) {
    throw new Error("IP privada bloqueada por seguridad");
  }
  return url;
}

// ── Fetch HTML + strip ──────────────────────────────────────
async function fetchPageText(url: URL): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AppResponSable/1.0; +https://app.responsable.net)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      throw new Error(`El sitio respondió ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("El recurso no es HTML o texto plano");
    }
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength && contentLength > MAX_BODY_BYTES) {
      throw new Error("Contenido demasiado grande (>5 MB)");
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) {
      throw new Error("Contenido demasiado grande (>5 MB)");
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return stripHtml(html);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Limpia HTML de manera defensiva. Para POC es suficiente.
 * V2 usaremos `html-to-text` si la calidad no es la mejor.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Schema del output de Claude ─────────────────────────────
const ExtractSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  excerpt: z.string().nullable(),
  reasoning: z.string(),
});

// ── Core: extractSector ─────────────────────────────────────
async function extractSectorFromText(text: string): Promise<Omit<ExtractResult, "cached">> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no configurada");
  }
  // Cargar catálogo de sectores (values canónicos + labels)
  const sectors = await listCatalog("sectors");
  const options = sectors
    .filter((s) => s.is_active)
    .map((s) => `  - ${s.value}  (${s.label}${s.group_name ? ` · ${s.group_name}` : ""})`)
    .join("\n");

  const truncated = text.slice(0, MAX_TEXT_CHARS);

  const systemPrompt = `Eres un extractor de datos para ResponSable, consultoría en sostenibilidad en México.

Tu tarea: analizar el texto y determinar el SECTOR del cliente empresarial que describe.

Debes elegir EXACTAMENTE UN valor de esta lista canónica. Si ninguno aplica, devuelve null.

<sectores_validos>
${options}
</sectores_validos>

Devuelve JSON puro (sin markdown, sin texto antes o después):
{
  "value": "<valor_canonico o null>",
  "confidence": <0.0 a 1.0>,
  "excerpt": "<cita textual del input, máx 200 chars, que justifica la decisión>",
  "reasoning": "<una frase corta en español>"
}

Reglas:
- value debe ser exactamente uno de los valores canónicos de la lista (no labels).
- Si el sector no se puede determinar con ≥0.5 de confianza, value=null, confidence=0.
- excerpt debe ser texto que EXISTE literalmente en el input.
- reasoning: máx 15 palabras.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Timeout 55s: Vercel maxDuration=60s deja margen de 5s para que el abort
  // propague y el route responda con error en vez de time out silencioso.
  // Sin este guard, una request colgada consume tokens de Anthropic hasta que
  // Vercel mata la función, sin cancelar la llamada upstream.
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cache_control: { type: "ephemeral" } as any,
      },
    ],
    messages: [{ role: "user", content: `<input>\n${truncated}\n</input>` }],
  }, { signal: AbortSignal.timeout(55_000) });

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Respuesta inesperada de la IA");
  }
  const raw = textBlock.text.trim();
  // Permitimos código ```json``` por si acaso
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("La IA no devolvió JSON válido");
  }
  const validated = ExtractSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("La IA devolvió un formato inesperado");
  }
  const result = validated.data;

  // Si el value no está en el catálogo, forzamos null
  const valid = sectors.find((s) => s.value === result.value);
  const label = valid?.label ?? null;

  return {
    value: valid ? result.value : null,
    label,
    confidence: valid ? result.confidence : 0,
    excerpt: result.excerpt,
    reasoning: result.reasoning,
    input_preview: truncated.slice(0, 500),
  };
}

// ── API pública ─────────────────────────────────────────────

export async function extractSectorFromUrl(url: string): Promise<ExtractResult> {
  const key = hashKey("url", url);
  const cached = getCached(key);
  if (cached) return cached;

  const validUrl = validateUrl(url);
  const text = await fetchPageText(validUrl);
  if (text.length < 50) {
    throw new Error("La página contiene muy poco texto para analizar");
  }
  const result = await extractSectorFromText(text);
  const full: ExtractResult = { ...result, cached: false };
  setCached(key, full);
  return full;
}

export async function extractSectorFromTranscript(
  transcript: string
): Promise<ExtractResult> {
  const trimmed = transcript.trim();
  if (trimmed.length < 30) {
    throw new Error("La transcripción es demasiado corta (mínimo 30 caracteres)");
  }
  const key = hashKey("text", trimmed);
  const cached = getCached(key);
  if (cached) return cached;

  const result = await extractSectorFromText(trimmed);
  const full: ExtractResult = { ...result, cached: false };
  setCached(key, full);
  return full;
}
