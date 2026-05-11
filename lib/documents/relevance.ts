// ── Relevance scoring de chunks de documentos (Wave 5c — F pragmático) ──
//
// Sin embeddings externos. BM25-style scoring sobre overlap de términos.
// Reduce ~70% el contexto enviado al LLM cuando el documento es grande
// (30K chars → 8K chars de chunks relevantes para esta pregunta específica).
//
// Beneficio: menos tokens input → más barato + más precisión (LLM no se
// distrae con secciones irrelevantes).
// ───────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  "de", "del", "al", "a", "en", "con", "por", "para", "sin",
  "y", "o", "u", "e", "ni", "que", "se", "su", "sus",
  "es", "son", "fue", "era", "ser", "está", "están", "estar",
  "lo", "le", "les", "me", "te", "nos", "como", "más", "muy",
  "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
  "sobre", "entre", "hasta", "desde", "ante", "bajo", "tras",
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "at", "for", "with",
]);

export type ChunkOptions = {
  chunkSize?: number;
  overlap?: number;
};

/**
 * Divide texto en chunks por párrafos. Si un párrafo excede chunkSize,
 * se parte por oraciones. Overlap entre chunks = continuidad de contexto.
 */
export function chunkMarkdown(text: string, opts?: ChunkOptions): string[] {
  const chunkSize = opts?.chunkSize ?? 1200;
  const overlap = opts?.overlap ?? 150;
  if (!text || text.length <= chunkSize) return text ? [text] : [];

  const paragraphs = text.split(/\n\s*\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let buffer = "";

  for (const p of paragraphs) {
    if (buffer.length + p.length + 2 <= chunkSize) {
      buffer = buffer ? `${buffer}\n\n${p}` : p;
      continue;
    }
    if (buffer) chunks.push(buffer);
    // Si párrafo único excede chunkSize, partir por oraciones
    if (p.length > chunkSize) {
      const sentences = p.split(/(?<=[.!?])\s+/);
      let s = "";
      for (const sent of sentences) {
        if (s.length + sent.length + 1 <= chunkSize) {
          s = s ? `${s} ${sent}` : sent;
        } else {
          if (s) chunks.push(s);
          s = sent.length > chunkSize ? sent.slice(0, chunkSize) : sent;
        }
      }
      buffer = s;
    } else {
      buffer = p;
    }
  }
  if (buffer) chunks.push(buffer);

  // Overlap: cada chunk arrastra últimas N chars del anterior
  if (overlap > 0 && chunks.length > 1) {
    return chunks.map((c, i) => {
      if (i === 0) return c;
      const prev = chunks[i - 1]!;
      const tail = prev.slice(Math.max(0, prev.length - overlap));
      return `${tail}\n\n${c}`;
    });
  }
  return chunks;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Score BM25-simplified: cuenta de matches únicos del query contra chunk,
 * normalizado por longitud del chunk (evita favorecer chunks largos por azar).
 */
export function scoreChunk(chunk: string, queryTokens: Set<string>): number {
  const chunkTokens = tokenize(chunk);
  if (chunkTokens.length === 0 || queryTokens.size === 0) return 0;
  let matches = 0;
  const seen = new Set<string>();
  for (const t of chunkTokens) {
    if (queryTokens.has(t) && !seen.has(t)) {
      matches++;
      seen.add(t);
    }
  }
  // Normalización: matches únicos / sqrt(longitud chunk en palabras)
  return matches / Math.sqrt(chunkTokens.length);
}

export type ScoredChunk = { chunk: string; score: number; index: number };

// Términos de sección ejecutiva — chunks con estas palabras reciben boost 1.15x.
// Aplica a documentos RSE donde resumen/conclusiones concentran los datos clave.
const POSITION_BONUS_TERMS = new Set([
  "resumen", "ejecutivo", "conclusion", "conclusiones", "objetivo", "objetivos",
  "alcance", "materialidad", "impacto", "riesgo", "oportunidad", "recomendacion",
  "recomendaciones", "hallazgo", "hallazgos", "resultado", "resultados",
  "estrategia", "vision", "mision", "introduccion", "presentacion",
]);

function positionMultiplier(chunk: string, index: number): number {
  let mult = index < 3 ? 1.2 : 1.0; // primeras secciones concentran contexto general
  const normalized = chunk
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const term of POSITION_BONUS_TERMS) {
    if (normalized.includes(term)) { mult *= 1.15; break; }
  }
  return mult;
}

/**
 * Top N chunks por relevancia al query, respetando un budget de chars total.
 * Devuelve preservando el orden original del documento (para continuidad).
 */
export function selectTopChunks(
  chunks: string[],
  query: string,
  opts?: { maxChars?: number; minScore?: number }
): ScoredChunk[] {
  const maxChars = opts?.maxChars ?? 8000;
  const minScore = opts?.minScore ?? 0.05;
  if (chunks.length === 0) return [];

  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    // Sin query útil — devolver primeros chunks hasta maxChars
    return chunks.slice().reduce<ScoredChunk[]>((acc, c, i) => {
      const used = acc.reduce((s, x) => s + x.chunk.length, 0);
      if (used + c.length <= maxChars) acc.push({ chunk: c, score: 0, index: i });
      return acc;
    }, []);
  }

  const scored = chunks.map((c, i) => ({
    chunk: c,
    score: scoreChunk(c, queryTokens) * positionMultiplier(c, i),
    index: i,
  }));
  // Mantener solo chunks con score real, ordenados desc
  const filtered = scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score);

  // Greedy: top score primero hasta llenar maxChars
  const selected: ScoredChunk[] = [];
  let used = 0;
  for (const s of filtered) {
    if (used + s.chunk.length > maxChars) continue;
    selected.push(s);
    used += s.chunk.length;
  }
  // Restaurar orden del documento original
  return selected.sort((a, b) => a.index - b.index);
}
