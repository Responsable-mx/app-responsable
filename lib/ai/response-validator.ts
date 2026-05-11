import "server-only";

// ── Validador de respuestas IA (E — Wave 2) ────────────────
// Detecta errores comunes ANTES de mostrar el output al consultor:
// - Códigos internos de catálogo expuestos (gri, doble_materialidad…)
// - Disclaimers genéricos sin valor ("Sujeto a verificación…")
// - URLs malformadas
// - Texto vacío o demasiado corto
// - Jerga inglesa donde debería ser español
//
// Devuelve { warnings: ValidationWarning[] } para que la UI decida si
// muestra el output con un banner de advertencia o lo bloquea.
// ───────────────────────────────────────────────────────────

export type ValidationSeverity = "info" | "warn" | "error";

export type ValidationWarning = {
  code: string;
  severity: ValidationSeverity;
  message: string;
  evidence?: string;
};

const CATALOG_CODES_REGEX =
  /\b(doble_materialidad|gri|sasb|tcfd|csrd|esrs|gri_standards|cdp|sbti|tnfd|ifrs_s|materialidad_simple|materialidad_doble|esr|gestionado|optimizado|inicial|definido|repetible)\b/gi;

const DISCLAIMER_PATTERNS = [
  /sujet[oa] a (verificación|confirmación)/i,
  /basado en (información|datos) (pública|disponibles?)\s*$/i,
  /podría no ser preciso/i,
  /no se garantiza la (exactitud|precisión)/i,
  /información (puede|podría) estar desactualizada/i,
];

const ENGLISH_LEAKS = [
  /\bregarding\b/i,
  /\bplease note\b/i,
  /\bas mentioned\b/i,
  /\bI'm sorry\b/i,
  /\bunfortunately\b/i,
  /\bthank you\b/i,
];

const URL_REGEX = /(https?:\/\/[^\s)]+)/g;

export function validateAiResponse(text: string, opts?: { minLength?: number }): ValidationWarning[] {
  const out: ValidationWarning[] = [];
  if (!text || typeof text !== "string") {
    out.push({ code: "empty", severity: "error", message: "Respuesta vacía o inválida." });
    return out;
  }

  const minLength = opts?.minLength ?? 20;
  const trimmed = text.trim();
  if (trimmed.length < minLength) {
    out.push({
      code: "too_short",
      severity: "warn",
      message: `Respuesta muy corta (${trimmed.length} chars). Verifica que el LLM no se haya cortado.`,
    });
  }

  // Códigos de catálogo expuestos
  const catalogMatches = trimmed.match(CATALOG_CODES_REGEX);
  if (catalogMatches && catalogMatches.length > 0) {
    // Filtrar siglas legítimas en mayúsculas (GRI, ESR como nombres de marco)
    const realLeaks = catalogMatches.filter((m) => /[a-z_]/.test(m) && m === m.toLowerCase());
    if (realLeaks.length > 0) {
      out.push({
        code: "catalog_code_leak",
        severity: "warn",
        message: `Códigos internos de catálogo expuestos al consultor: ${[...new Set(realLeaks)].slice(0, 3).join(", ")}. Debería humanizarse antes de mostrar.`,
        evidence: realLeaks[0],
      });
    }
  }

  // Disclaimers genéricos sin valor
  for (const pattern of DISCLAIMER_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) {
      out.push({
        code: "generic_disclaimer",
        severity: "info",
        message: `Disclaimer genérico detectado — considera ocultarlo o reemplazar con info accionable.`,
        evidence: m[0],
      });
      break;
    }
  }

  // Jerga inglesa
  for (const pattern of ENGLISH_LEAKS) {
    const m = trimmed.match(pattern);
    if (m) {
      out.push({
        code: "english_leak",
        severity: "warn",
        message: `Texto en inglés detectado: "${m[0]}". La respuesta debería estar en español es-MX.`,
        evidence: m[0],
      });
      break;
    }
  }

  // URLs malformadas
  const urls = trimmed.match(URL_REGEX) ?? [];
  for (const url of urls) {
    try {
      const u = new URL(url);
      if (!u.hostname || u.hostname.length < 4) {
        out.push({
          code: "malformed_url",
          severity: "warn",
          message: `URL malformada en respuesta: ${url.slice(0, 60)}`,
          evidence: url,
        });
        break;
      }
    } catch {
      out.push({
        code: "malformed_url",
        severity: "warn",
        message: `URL inválida: ${url.slice(0, 60)}`,
        evidence: url,
      });
      break;
    }
  }

  return out;
}

/**
 * Helper: hay al menos una warning de severity "error" o "warn"
 */
export function hasBlockingWarnings(warnings: ValidationWarning[]): boolean {
  return warnings.some((w) => w.severity === "error" || w.severity === "warn");
}
