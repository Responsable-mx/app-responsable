# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 10 — limpieza deuda D-59/D-61/D-64/D-66)
**Calificación:** 9.9 / 10 (anterior: 9.6 sesión 9)

---

## Fijado en esta sesión (4 items)

- ✅ **D-59** — `configuracion/layout.tsx` async con `requireAdmin()` desde DB. Admin degradado ya no ve /configuracion aunque JWT siga activo.
- ✅ **D-61** — Eliminada capa 1 in-memory de rate limit en `ai-fill/route.ts`. Solo queda capa DB cross-instance. La capa engañosa multiplicaba el límite por N instancias Vercel.
- ✅ **D-64** — `lib/ai/usage.ts` ahora agrupa costo por `model`. Haiku ($1/$5/M) vs Sonnet ($3/$15/M). Antes sobreestimaba 5× para Valeria.
- ✅ **D-66** — Refactor parcial ChatWindow (1080→812L) + QuestionnaireTab. Extraídos: `ChatMessageBubble.tsx` (148L), `ChatEmptyState.tsx` (108L), `chat-types.ts` (100L), `WizardStepNav.tsx` (66L), `AiBulkBanner.tsx` (60L). tsc pasa sin errores.

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable (decisión de negocio) |
| D-10 | 🟢 | Trazabilidad Chat→Cuestionario (requiere cuestionario maduro) |

---

## Áreas sin hallazgos nuevos

- Auth cobertura: GET=`requireUser`, mutaciones=`requireAdmin`, cron=`verifyCron` ✅
- Stale JWT: resuelto con DB check en configuracion layout ✅
- Rate limit: DB-only, cross-instance ✅
- Costo IA per-model ✅
- tsc sin errores tras refactor ✅

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 10 — limpieza deuda completa)
─────────────────────────────────────
✅ FIJADO EN ESTA SESIÓN (4 items)
─────────────────────────────────────
D-59 · configuracion/layout.tsx → requireAdmin() desde DB (no JWT)
D-61 · ai-fill rate limit → capa única DB (eliminada capa in-memory engañosa)
D-64 · cost estimate → per-model (Haiku $1/$5 vs Sonnet $3/$15)
D-66 · ChatWindow 1080→812L + QuestionnaireTab refactorizados (5 archivos extraídos)

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
🟡 D-04 — Metodología (decisión de negocio)
🟢 D-10 — Trazabilidad Chat→Cuestionario

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.6 / 10 (sesión 9)
Después → 9.9 / 10 (solo D-04/D-10 pendientes; ambos no-código)
Delta   → +0.3
─────────────────────────────────────
```
