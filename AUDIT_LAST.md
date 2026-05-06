# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 9 — auditoría completa: /audit + /audit-ia + /audit-health + /audit-refactor + /simplify)
**Calificación:** 9.4 / 10 (anterior: 9.9 sesiones 7+8)

---

## Hallazgos nuevos esta sesión (D-58 – D-74)

| ID | Sev | Área | Descripción | Estado |
|----|-----|------|-------------|--------|
| D-58 | 🟡 | Seguridad | Middleware comenta cobertura `/api/catalogs` inexistente — engaña a devs futuros | Pendiente |
| D-59 | 🟡 | Seguridad | Stale JWT: admin degradado sigue viendo `/configuracion` hasta próximo login | Pendiente |
| D-60 | 🟡 | Seguridad | `/api/clients/[id]/questionnaire` PATCH + ai-fill POST sin ownership check | Pendiente |
| D-61 | 🟡 | Seguridad | Rate limit in-memory ai-fill ineficaz en multi-instancia Vercel (capa 1 rota) | Pendiente |
| D-63 | 🟡 | IA | ai-fill sin AbortSignal/timeout → lambda muere sin dar error al cliente (≤270s) | Pendiente |
| D-65 | 🟡 | UX/IA | ChatWindow enviaba historial completo (>50 msg) a API con max(50) → 400 silencioso | ✅ Fijado |
| D-66 | 🟡 | Refactor | `ChatWindow.tsx` (1074L) + `QuestionnaireTab.tsx` (1043L) monolíticos | Pendiente |
| D-64 | 🟢 | IA | Estimado de costo usa precio Sonnet para todos — sobreestima Valeria (Haiku) ×5 | Pendiente |
| D-67 | 🟢 | Refactor | Comentario middleware desincronizado (secundario a D-58) | Pendiente |
| D-68 | 🟢 | UX | `PromptEditor` skeleton infinito cuando SWR falla | ✅ Fijado |
| D-69 | 🟢 | UX | `HistoryPanel` silencia fallo de carga de versiones | Pendiente |
| D-70 | 🟢 | UX | `ChatSessionsPanel` silencia fallo de carga | ✅ Fijado |
| D-71 | 🟢 | UX | `ClientsList` muestra empty state falso cuando SWR falla | ✅ Fijado |
| D-72 | 🟢 | UX | `EquipoView` silencia fallos de sus 2 SWR | Pendiente |
| D-73 | 🟢 | UX | `PromptsManager` ignora `meta.error` | Pendiente |
| D-74 | 🟢 | UX | `ClientTabs` silencia errores de revalidación SWR | Pendiente |

---

## Fijado en esta sesión

- ✅ **D-65** — `ChatWindow.send()` ahora usa `history.slice(-50)` si `length > 50`. Sesiones largas cargadas del historial (hasta 200 msgs) ya no retornan 400 sin explicación.
- ✅ **D-68** — `PromptEditor`: `swrError && !data` muestra banner de error en lugar de skeleton perpetuo.
- ✅ **D-70** — `ChatSessionsPanel`: `error && !data` → banner "Error al cargar conversaciones" + botón reintentar.
- ✅ **D-71** — `ClientsList`: `swrError && clients.length === 0` → banner de error en lugar de empty state falso.
- ✅ **feat** — Rename de sesión de chat: PATCH endpoint + inline edit en `ChatSessionsPanel` (lápiz + doble-click).

---

## Áreas sin hallazgos nuevos

- Auth cobertura: GET=`requireUser`, mutaciones=`requireAdmin`, cron=`verifyCron` — consistente ✅
- Streaming `/api/chat`: AbortController 45s, retry 529, rate limit 30msg/5min ✅
- Anti-IDOR: ownership check en stages/activities/materiality ✅
- Validación Zod en todos los inputs antes de DB ✅
- Prompt caching: 2 breakpoints ephemeral correctos en `buildSystemBlocks` ✅
- Anti-alucinación: `DEFAULT_BASE_RULES` incluye `[estimación]` y `[supuesto]` para los 4 roles ✅
- Model routing: Aurora/Rebeca/Elena=Sonnet, Valeria=Haiku — justificado ✅
- `extractJsonObject` balanced-brace parser (D-20) ✅
- `logChange()` fail-open en audit log ✅
- ARIA: `role="log" aria-live="polite"` en chat, tabs con `aria-selected/controls` (sesión 7) ✅

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-58 | 🟡 | Middleware /api/catalogs comment vs code |
| D-59 | 🟡 | Stale JWT admin demoted |
| D-60 | 🟡 | Questionnaire/ai-fill sin ownership check |
| D-61 | 🟡 | Rate limit in-memory ineficaz |
| D-63 | 🟡 | ai-fill sin AbortSignal |
| D-66 | 🟡 | ChatWindow + QuestionnaireTab monolíticos |
| D-04 | 🟡 | Metodología ResponSable (decisión negocio) |
| D-10 | 🟢 | Trazabilidad Chat→Cuestionario |
| D-64 | 🟢 | Estimado costo Sonnet-only |
| D-67 | 🟢 | Middleware comment mismatch |
| D-69 | 🟢 | HistoryPanel SWR error state |
| D-72 | 🟢 | EquipoView SWR error states |
| D-73 | 🟢 | PromptsManager meta.error |
| D-74 | 🟢 | ClientTabs SWR revalidation error |

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 9 — audit completo /audit-ia /audit-health /audit-refactor)
─────────────────────────────────────
✅ FIJADO EN ESTA SESIÓN
─────────────────────────────────────
D-65 · ChatWindow history clip — sesiones >50 msgs ya no rompen silenciosamente
D-68 · PromptEditor skeleton infinito → banner de error
D-70 · ChatSessionsPanel fallo silencioso → banner + reintentar
D-71 · ClientsList empty state falso → banner de error
feat · Rename sesión de chat (PATCH + inline edit lápiz/doble-click)

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
🟡 D-60 — Questionnaire/ai-fill sin ownership check (datos + tokens)  ← prioritario
🟡 D-63 — ai-fill sin AbortSignal/timeout (UX roto en timeouts)
🟡 D-58 — Middleware comment engañoso
🟡 D-59 — Stale JWT admin (UX, sin riesgo de mutación)
🟡 D-61 — Rate limit in-memory (best-effort en prod)
🟡 D-66 — Monolíticos >1000L
🟢 6 SWR error states + 2 deuda histórica

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.9 / 10 (sesiones 7+8 design polish)
Después → 9.4 / 10 (16 hallazgos nuevos — 5 fijados en sesión)
Delta   → -0.5 (deuda nueva mayor que fixes; ajuste realista)
─────────────────────────────────────
```
