import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { z } from "zod";
import { listCatalog } from "@/lib/catalogs";

const MODEL = process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-6";
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
};

// ── Cache 30 min ─────────────────────────────────────────────
type CacheEntry = { result: ProfileExtractResult; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function hashKey(url: string): string {
  return crypto.createHash("sha256").update(url.trim().toLowerCase()).digest("hex");
}

function getCached(key: string): ProfileExtractResult | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return { ...entry.result, cached: true };
}

function setCached(key: string, result: ProfileExtractResult): void {
  cache.set(key, { result: { ...result, cached: false }, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 200) {
    [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt).slice(0, 50).forEach(([k]) => cache.delete(k));
  }
}

// ── Anti-SSRF ────────────────────────────────────────────────
const BLOCKED = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"]);

function isPrivateIPv4(h: string): boolean {
  const [a = 0, b = 0] = h.split(".").map(Number);
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function validateUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("URL inválida"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Solo http/https");
  const host = url.hostname.toLowerCase();
  if (BLOCKED.has(host) || isPrivateIPv4(host)) throw new Error("Hostname bloqueado por seguridad");
  return url;
}

// ── Fetch + parse HTML ───────────────────────────────────────
type PageData = { text: string; ogImage: string | null };

async function fetchPageData(url: URL): Promise<PageData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
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

async function extractFromText(text: string): Promise<Omit<ProfileExtractResult, "logo_url" | "cached">> {
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

  return {
    sector: validSector?.value ?? null,
    sector_label: validSector?.label ?? null,
    subsector: d.subsector ?? null,
    size: validSize?.value ?? null,
    size_label: validSize?.label ?? null,
    countries: validCountries,
  };
}

// ── API pública ──────────────────────────────────────────────
export async function extractProfileFromUrl(rawUrl: string): Promise<ProfileExtractResult> {
  const key = hashKey(rawUrl);
  const cached = getCached(key);
  if (cached) return cached;

  const url = validateUrl(rawUrl);
  const { text, ogImage } = await fetchPageData(url);
  if (text.length < 50) throw new Error("La página contiene muy poco texto para analizar");

  const fields = await extractFromText(text);
  // Preferimos Google favicon service (logo nítido, siempre cuadrado) sobre og:image
  // que suele ser una foto hero o banner, no el logotipo de la empresa.
  const logoUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
  const result: ProfileExtractResult = { ...fields, logo_url: logoUrl, cached: false };
  setCached(key, result);
  return result;
}
