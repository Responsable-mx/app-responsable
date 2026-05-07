/**
 * Extrae el primer objeto JSON de un string de texto libre (output LLM).
 * Maneja code blocks ```json...``` y texto con contenido antes/después.
 * Usa balanced-brace parsing para robustez ante JSON malformado parcial.
 */
export function extractJsonObject(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const searchText = codeBlockMatch ? codeBlockMatch[1]! : text;
  const start = searchText.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < searchText.length; i++) {
    const ch = searchText[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return searchText.slice(start, i + 1);
    }
  }
  return null;
}
