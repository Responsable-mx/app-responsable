# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 11 — D-10 trazabilidad Chat→Cuestionario)
**Calificación:** 10 / 10

---

## Fijado en esta sesión (1 item)

- ✅ **D-10** — Trazabilidad Chat → Cuestionario implementada:
  - `lib/ai/roles.ts`: `buildQuestionnaireSection()` inyecta campos llenos al contexto del LLM con instrucción de citar `[campo:key]`.
  - `app/api/chat/route.ts`: fetch `getQuestionnaireBundle()` en paralelo con `getClient()`.
  - `components/chat/ChatMessageBubble.tsx`: `resolveCampoRefs()` convierte `[campo:key]` en link Markdown `📋 key → /clientes/{id}?tab=cuestionario`.
  - `buildSystemBlocks()` recibe `questionnaire?` opcional (retrocompat sin romper ai-fill ni tests).

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable (decisión de negocio — no código) |

---

## Áreas sin hallazgos nuevos

- Auth: `requireConsultorOrAdmin` en `/api/chat` ✅
- Cache ephemeral: 2 breakpoints intactos; questionnaire data dentro del primer bloque ✅
- tsc: sin errores ✅
- Questionnaire fetch: `Promise.all` paralelo + `.catch(() => null)` fail-open ✅

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 11 — D-10)
─────────────────────────────────────
✅ FIJADO EN ESTA SESIÓN (1 item)
─────────────────────────────────────
D-10 · Trazabilidad Chat→Cuestionario
  - buildClientContext inyecta campos llenos del cuestionario
  - LLM instruido a citar [campo:key]
  - UI convierte citas en links clicables al cuestionario

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
🟡 D-04 — Metodología (decisión de negocio, no es código)

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.9 / 10 (sesión 10)
Después → 10 / 10 (única deuda restante es D-04 business decision)
Delta   → +0.1
─────────────────────────────────────
```
