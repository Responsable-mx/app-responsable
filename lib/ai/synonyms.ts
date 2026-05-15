import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface TerminologySynonym {
  responsable_term: string;
  category: string;
  synonyms_es: string[];
  synonyms_en: string[];
}

export interface ClientVocabEntry {
  client_term: string;
  responsable_term: string;
}

// In-memory cache 2h — el glosario global cambia rarísimo
let globalCache: { data: TerminologySynonym[]; ts: number } | null = null;
const CACHE_TTL = 7_200_000;

export async function loadGlobalSynonyms(): Promise<TerminologySynonym[]> {
  if (globalCache && Date.now() - globalCache.ts < CACHE_TTL) return globalCache.data;
  const sb = createAdminClient();
  const { data } = await sb
    .from("terminology_synonyms")
    .select("responsable_term, category, synonyms_es, synonyms_en")
    .eq("active", true)
    .order("sort_order");
  const result = (data ?? []) as TerminologySynonym[];
  globalCache = { data: result, ts: Date.now() };
  return result;
}

export async function loadClientVocabulary(clientId: string): Promise<ClientVocabEntry[]> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("client_vocabulary")
    .select("client_term, responsable_term")
    .eq("client_id", clientId)
    .eq("active", true)
    .order("created_at");
  return (data ?? []) as ClientVocabEntry[];
}

export function buildSynonymsBlock(
  global: TerminologySynonym[],
  perClient: ClientVocabEntry[]
): string {
  const globalLines = global
    .map((s) => {
      const all = [...s.synonyms_es, ...s.synonyms_en].filter(Boolean);
      if (all.length === 0) return null;
      return `  <term responsable="${s.responsable_term}" synonyms="${all.join(" | ")}" />`;
    })
    .filter(Boolean);

  const clientLines = perClient.map(
    (v) => `  <term client="${v.client_term}" responsable="${v.responsable_term}" />`
  );

  if (globalLines.length === 0 && clientLines.length === 0) return "";

  const sections: string[] = [];
  if (globalLines.length > 0) {
    sections.push(`<global_terminology>\n${globalLines.join("\n")}\n</global_terminology>`);
  }
  if (clientLines.length > 0) {
    sections.push(`<client_terminology>\n${clientLines.join("\n")}\n</client_terminology>`);
  }

  return `\n<terminology_bridge>
Al leer documentos o texto del cliente, si encuentras alguno de estos términos identifica su equivalente en la terminología de ResponSable. En reportes y respuestas usa primero el término de ResponSable y entre paréntesis el del cliente cuando difiera notablemente. Ejemplo: "Doble Materialidad (assessment de materialidad, como lo denominan internamente)".
${sections.join("\n")}
</terminology_bridge>`;
}
