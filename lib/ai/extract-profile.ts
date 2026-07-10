import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { z } from "zod";
import { listCatalog } from "@/lib/catalogs";
import { isPublicHttpUrl, safeFetch } from "@/lib/documents/ssrf";
import { getTaskConfig } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";

// Extracción de perfil desde URL/HTML → tarea estructurada → Haiku (12× más barato que Sonnet)
const MODEL = getTaskConfig("extract").model;
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 15_000;

export type ProfileExtractResult = {
  sector: string | null;
  sector_label: string | null;
  subsector: string | null;
  size: string | null;
  size_label: string | null;
  countries: string[];
  logo_url: string | null;
  cached: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
};

// ── Cache DB-backed (profile_url_cache) ──────────────────────
// Sobrevive deploys y múltiples instancias serverless.
// Fail-open: errores de DB no rompen el flujo principal.

function hashKey(url: string): string {
  return crypto.createHash("sha256").update(url.trim().toLowerCase()).digest("hex");
}

async function getCached(key: string): Promise<ProfileExtractResult | null> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("profile_url_cache")
      .select("result")
      .eq("url_hash", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data) return null;
    return { ...(data.result as ProfileExtractResult), cached: true };
  } catch {
    return null;
  }
}

async function setCached(key: string, result: ProfileExtractResult): Promise<void> {
  try {
    const db = createAdminClient();
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    await db.from("profile_url_cache").upsert({
      url_hash: key,
      result: { ...result, cached: false },
      cached_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
    // Cleanup expirados — best-effort, no await
    void db.from("profile_url_cache").delete().lt("expires_at", new Date().toISOString());
  } catch {
    // Non-critical — continuar sin cachear
  }
}

// ── Anti-SSRF — reutiliza isPublicHttpUrl de lib/documents/ssrf.ts ──────────
// Cubre: RFC1918, loopback, link-local, IPv6 ULA, IPv4-mapped IPv6 (::ffff:*)
function validateUrl(raw: string): URL {
  const check = isPublicHttpUrl(raw);
  if (!check.ok) throw new Error(check.reason ?? "URL bloqueada por seguridad");
  return new URL(raw);
}

// ── Fetch + parse HTML ───────────────────────────────────────
type PageData = { text: string; ogImage: string | null };

async function fetchPageData(url: URL): Promise<PageData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(url.toString(), {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AppResponSable/1.0; +https://app.responsable.net)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`El sitio respondió ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) throw new Error("El recurso no es HTML");
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len && len > MAX_BODY_BYTES) throw new Error("Contenido demasiado grande");
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) throw new Error("Contenido demasiado grande");
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const ogImage = extractOgImage(html);
    const text = stripHtml(html);
    return { text, ogImage };
  } finally {
    clearTimeout(timer);
  }
}

function extractOgImage(html: string): string | null {
  const match =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  const url = match?.[1]?.trim() ?? null;
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Claude extraction ────────────────────────────────────────
const ExtractSchema = z.object({
  sector: z.string().nullable(),
  subsector: z.string().max(120).nullable(),
  size: z.string().nullable(),
  countries: z.array(z.string()).default([]),
});

type ExtractTextResult = Omit<ProfileExtractResult, "logo_url" | "cached">;

async function extractFromText(text: string): Promise<ExtractTextResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

  const [sectors, sizes, countries] = await Promise.all([
    listCatalog("sectors"),
    listCatalog("client_sizes"),
    listCatalog("countries"),
  ]);

  const sectorOpts = sectors.filter(s => s.is_active)
    .map(s => `  ${s.value}  (${s.label}${s.group_name ? ` · ${s.group_name}` : ""})`).join("\n");
  const sizeOpts = sizes.filter(s => s.is_active)
    .map(s => `  ${s.value}  (${s.label})`).join("\n");
  const countryOpts = countries.filter(s => s.is_active)
    .map(s => `  ${s.value}  (${s.label})`).join("\n");

  const system = `Eres un extractor de datos para ResponSable, consultoría en sostenibilidad en México.
Analiza el texto del sitio web de una empresa y extrae 4 campos. Devuelve SOLO JSON, sin markdown.

SECTORES VÁLIDOS (usa exactamente el valor canónico):
${sectorOpts}

TAMAÑOS VÁLIDOS:
${sizeOpts}

PAÍSES VÁLIDOS (array, usa exactamente los valores canónicos):
${countryOpts}

Formato de respuesta:
{
  "sector": "<valor_canonico o null>",
  "subsector": "<texto corto descriptivo o null, máx 80 chars>",
  "size": "<valor_canonico o null>",
  "countries": ["<valor>", ...]
}

Reglas:
- sector y size: solo valores canónicos exactos de las listas, o null si no puedes determinar.
- subsector: descripción específica dentro del sector (ej: "Cervezas", "Retail deportivo"). null si no aplica.
- countries: lista de países donde opera según el texto. Si no hay información, ["mx"] como default.
- Si el texto es muy escaso, devuelve null en los campos que no puedas determinar.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } as never }],
    messages: [{ role: "user", content: `<sitio_web>\n${text.slice(0, MAX_TEXT_CHARS)}\n</sitio_web>` }],
  }, { signal: AbortSignal.timeout(55_000) });

  const textBlock = resp.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Respuesta inesperada de la IA");

  const raw = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("La IA no devolvió JSON válido"); }

  const validated = ExtractSchema.safeParse(parsed);
  if (!validated.success) throw new Error("La IA devolvió un formato inesperado");

  const d = validated.data;

  const validSector = sectors.find(s => s.value === d.sector);
  const validSize = sizes.find(s => s.value === d.size);
  const validCountries = (d.countries ?? []).filter(c => countries.some(cat => cat.value === c));

  const u = resp.usage as { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  return {
    sector: validSector?.value ?? null,
    sector_label: validSector?.label ?? null,
    subsector: d.subsector ?? null,
    size: validSize?.value ?? null,
    size_label: validSize?.label ?? null,
    countries: validCountries,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
}

// ── API pública ──────────────────────────────────────────────
export async function extractProfileFromUrl(rawUrl: string): Promise<ProfileExtractResult> {
  const key = hashKey(rawUrl);
  const cached = await getCached(key);
  if (cached) return cached;

  const url = validateUrl(rawUrl);
  const { text } = await fetchPageData(url);
  if (text.length < 50) throw new Error("La página contiene muy poco texto para analizar");

  const fields = await extractFromText(text);
  // Preferimos Google favicon service (logo nítido, siempre cuadrado) sobre og:image
  // que suele ser una foto hero o banner, no el logotipo de la empresa.
  const logoUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
  const result: ProfileExtractResult = { ...fields, logo_url: logoUrl, cached: false };
  await setCached(key, result);
  return result;
}
