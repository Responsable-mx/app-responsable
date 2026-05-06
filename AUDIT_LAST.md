# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 13 — auditoría IA + cierre D-73→D-78)
**Calificación:** 10 / 10

---

## Contexto de esta auditoría

Auditoría `/audit-ia` post-seguridad. Foco: call sites Anthropic SDK, costos, cache, max_tokens, anti-alucinación.
Todos los hallazgos D-73→D-78 cerrados en la misma sesión.

---

## Sin hallazgos activos

| Categoría | Resultado |
|-----------|-----------|
| **Call sites Anthropic SDK** | 3 activos: `api/chat`, `ai-fill`, `doc-fill`, `extract-test`. Todos con timeout `AbortSignal.timeout`. |
| **Modelos** | Aurora/Rebeca=Sonnet4, Elena=Opus4 (D-75 resuelto), Valeria=Haiku4.5. Routing correcto. |
| **Cache** | 2 breakpoints ephemeral en `buildSystemBlocks`. `doc-fill` y `extract-test` añaden ephemeral (D-78 resuelto). |
| **max_tokens** | Todos calibrados: chat 1500, ai-fill 4096 (web_search extenso), doc-fill 2000 (D-77), extract-test 400. |
| **Rate limiting IA** | `ai-fill` 15/min, `doc-fill` 15/min (D-76 resuelto), `chat` 30/5min. Sin gaps. |
| **persistSession** | Fail-open correcto; catch loguea para debug prod (D-73 resuelto). |
| **Tipos beta SDK** | `cache_control`, `web_search`, cache fields — `eslint-disable` justificados (D-74 documentado). |
| **Anti-alucinación tools** | No aplica — este proyecto no usa tool-use con arrays >10 items en el chat IA. |
| **Parsing JSON LLM** | `extractJsonObject` con balanced-brace parser en `ai-fill`, `doc-fill`, `chat`. Robusto. |
| **Env vars modelos** | `ANTHROPIC_MODEL_SONNET`, `ANTHROPIC_MODEL_OPUS`, `ANTHROPIC_MODEL_HAIKU` — fallbacks hardcoded. |

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable (decisión de negocio) |

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 13 — auditoría IA)
─────────────────────────────────────
🔴 CRÍTICOS: 0
🟡 MODERADOS: 0 (D-73→D-78 cerrados)
🟢 MENORES: 0

─────────────────────────────────────
✅ D-73 — persistSession loguea errores en prod
✅ D-74 — tipos beta SDK documentados
✅ D-75 — Elena → Opus 4 (correcto para synthesis estratégica)
✅ D-76 — doc-fill rate limit 15/min igual que ai-fill
✅ D-77 — doc-fill max_tokens 4096→2000
✅ D-78 — extract-test cache_control ephemeral

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 10 / 10 (sesión 12, seguridad)
Después → 10 / 10 (IA limpia también)
─────────────────────────────────────
Deuda activa: D-04 (decisión de negocio, no técnico)
─────────────────────────────────────
```
