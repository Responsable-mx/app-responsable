import { GoogleGenerativeAI } from "@google/generative-ai";

let _genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI | null {
  if (!process.env.GOOGLE_AI_API_KEY) return null;
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  return _genAI;
}

/**
 * Extrae campos estructurados de documentos usando Gemini Flash.
 * Retorna null si la key no está configurada o si Gemini falla (caller usa fallback).
 */
export async function extractWithGemini(opts: {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}): Promise<string | null> {
  const genAI = getGeminiClient();
  if (!genAI) return null;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 8192,
      },
      systemInstruction: opts.systemPrompt,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
    try {
      const result = await model.generateContent(opts.userPrompt);
      clearTimeout(timer);
      return result.response.text();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
