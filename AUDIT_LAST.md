# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-08 (sesión 22 — audit-ia + audit-seg + audit-health + audit-refactor + simplify)
**Calificación global:** 9.6 / 10

---

## Hallazgos sesión 22 — nuevos desde sesión 21

| ID | Sev | Descripción | Estado |
|----|-----|-------------|--------|
| D-144 | 🔴 | SSRF guard duplicado en `extract-profile.ts` — más débil que `isPublicHttpUrl` (sin IPv4-mapped IPv6, sin prefijo 127.*, sin IPv6 ULA fc/fd) | ✅ Resuelto |
| D-145 | 🟡 | Rate limit extract-profile usa `chat_requests` sin índice compuesto `(user_email, role, created_at)` → COUNT O(n) | Pendiente DEUDA.md |
| D-146 | 🟢 | `extract-profile` no llamaba `logAiCall()` — tokens IA sin trazabilidad en dashboard uso-ia | ✅ Resuelto |
| D-147 | 🟢 | Cache in-memory en `extract-profile.ts` se pierde en cada deploy — aceptable para MVP (8 usuarios) | Documentado, aceptado MVP |

---

## Fixes aplicados sesión 22

### D-144 — SSRF guard unificado (🔴 → ✅)

**Problema**: `lib/ai/extract-profile.ts` tenía su propia implementación SSRF que:
- No cubría IPv4-mapped IPv6: `::ffff:192.168.1.1` bypasaba `isPrivateIPv4()` (split por `.` → NaN)
- No cubría prefijo `127.*` (solo `127.0.0.1` exacto)
- No cubría IPv6 ULA (`fc`/`fd` prefixes)
- Duplicaba lógica ya existente en `lib/documents/ssrf.ts`

**Fix sesión 22**:
1. `lib/documents/ssrf.ts`: agregado check `::ffff:*` IPv4-mapped IPv6 para todos los rangos RFC1918
2. `lib/ai/extract-profile.ts`: `validateUrl()` reemplazada → usa `isPublicHttpUrl` de ssrf.ts

**Fix adicional sesión 22 (post-tests)**: El check `::ffff:*` inicial era incorrecto — Node.js WHATWG URL parser normaliza `[::ffff:192.168.1.1]` a hostname `::ffff:c0a8:101` (grupos hex). El regex dotted-decimal nunca matcheaba. Bug descubierto al escribir tests de regresión. Fix: conversión hex→decimal antes del regex (`hi/lo = parseInt(parts, 16)` → `octet = (hi >> 8) & 0xff` etc.).

### D-146 — logAiCall en extract-profile (🟢 → ✅)

**Problema**: `POST /api/clients/extract-profile` ejecutaba Claude (Sonnet, 300 max_tokens) sin registrar en `ai_calls`. Dashboard `uso-ia` no contabilizaba estas llamadas.

**Fix**:
- `ProfileExtractResult` añade campos opcionales `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`
- `extractFromText()` propaga `resp.usage` en el return
- Route llama `logAiCall()` con tokens reales (no 0). Si resultado es cached, no loguea (no hubo llamada IA)

---

## Descartados (falsos positivos del análisis)

| Falso positivo | Razón |
|----------------|-------|
| "extractOgImage acepta `data:` URIs" | INCORRECTO — ya filtra `u.protocol !== "http:" && !== "https:"` → retorna null |
| "coerceInput omite `website_url`" | INCORRECTO — línea 430 ya lo incluye |
| "parseDomain puede romper render" | INCORRECTO — tiene try/catch, retorna null en error |
| "ClientAvatar usa client innecesariamente" | Sin riesgo — solo se importa desde Client Components |

---

## Áreas sin hallazgos nuevos sesión 22

| Área | Resultado |
|------|-----------|
| Auth en `extract-profile` — `requireUser()` correcto (consultores pueden extraer perfiles) | ✅ |
| Content-Type validation en `fetchPageData` — verifica text/html, rechaza binarios | ✅ |
| Timeout 15s fetch + 55s Anthropic — apropiados para sitios corporativos | ✅ |
| Max body bytes 5MB — cap correcto contra DoS | ✅ |
| HTML stripping antes de enviar a IA — script/style/noscript removidos | ✅ |
| `coerceInput` KEYS — `website_url` y `logo_url` presentes (fix de sesión 22) | ✅ |
| `ClientAvatar` imgError state — fallback a monogram correcto | ✅ |
| `ClientsList parseDomain` — try/catch, null safe | ✅ |
| Model routing `extract-profile` — Sonnet vía env var `ANTHROPIC_MODEL_SONNET` | ✅ |
| Prompt caching en `extract-profile` — `cache_control: ephemeral` en system block | ✅ |
| DM benchmark `max_tokens: 8000` — ≤ límite Sonnet 4.6 (8192), output esperado ~3-5k tokens | ✅ |
| Rate limit 20/5min con fail-open — comportamiento correcto | ✅ |

---

## Pendientes activos

| ID | Sev | Descripción |
|----|-----|-------------|
| D-145 | 🟡 | `chat_requests` sin índice `(user_email, role, created_at)` — O(n) COUNT para rate limit |
| D-04  | 🟡 | Metodología ResponSable — decisión de negocio, no código |
| —     | 🟢 | `SENTRY_AUTH_TOKEN` en Vercel env vars (manual) |
| —     | 🟢 | Secrets GitHub E2E en repo Settings |
| —     | 🟢 | Cron para `cleanup_rate_limit_hits()` — función DB sin caller |

---

## Score sesión 22

| Dimensión | Post-21 | Post-22 | Delta |
|-----------|---------|---------|-------|
| Seguridad | 9.5 | 9.7 | +0.2 (D-144 SSRF IPv4-mapped cubierto, guard unificado) |
| Confiabilidad | 9.8 | 9.8 | — |
| UX | 9.2 | 9.2 | — |
| Arquitectura | 9.8 | 9.8 | — |
| Rendimiento | 9.2 | 9.2 | — |
| Calidad de código | 9.8 | 9.8 | — (zero TS errors mantenido) |
| Observabilidad | 9.2 | 9.5 | +0.3 (D-146 logAiCall extract-profile con tokens reales) |
| Deuda técnica | 9.8 | 9.6 | -0.2 (D-145 nuevo pendiente) |
| **Global** | **9.8** | **9.6** | **-0.2** |

> Nota: score baja levemente por D-145 nuevo (rate limit sin índice). D-144 resuelto compensa en seguridad.

---

## Auditoría anterior: 2026-05-07 (sesión 21)
**Score:** 9.8/10
