# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 9 — auditoría completa: /audit + /audit-ia + /audit-health + /audit-refactor + /simplify)
**Calificación:** 9.6 / 10 (anterior: 9.9 sesiones 7+8)

---

## Hallazgos y estado (D-58 – D-74)

| ID | Sev | Área | Descripción | Estado |
|----|-----|------|-------------|--------|
| D-58 | — | Seguridad | Middleware comment /api/catalogs engañoso | ✅ Resuelto (middleware refactorizado externamente) |
| D-59 | 🟡 | Seguridad | Stale JWT: admin degradado ve /configuracion en UI hasta próximo login | Aceptado piloto — documentado DEUDA.md |
| D-60 | — | Seguridad | Questionnaire/ai-fill sin ownership check | ✅ N/A — diseño explícito: todos los consultores acceden a todos los clientes (STACK.md + D-29) |
| D-61 | 🟡 | Seguridad | Rate limit in-memory ai-fill roto en multi-instancia | Aceptado piloto — documentado DEUDA.md |
| D-63 | 🟡 | IA | ai-fill sin AbortSignal/timeout → lambda muere sin feedback al cliente | ✅ Fijado |
| D-65 | 🟡 | UX/IA | ChatWindow enviaba historial completo (>50 msg) a API → 400 silencioso | ✅ Fijado |
| D-66 | 🟡 | Refactor | ChatWindow.tsx + QuestionnaireTab.tsx monolíticos >1000L | Documentado DEUDA.md |
| D-64 | 🟢 | IA | Costo estimado usa Sonnet para Valeria (Haiku) — sobreestima ×5 | Documentado DEUDA.md |
| D-67 | — | Refactor | Middleware comment mismatch | ✅ Resuelto (junto con D-58) |
| D-68 | 🟢 | UX | PromptEditor skeleton infinito cuando SWR falla | ✅ Fijado |
| D-69 | 🟢 | UX | HistoryPanel silencia fallo de carga de versiones | ✅ Fijado |
| D-70 | 🟢 | UX | ChatSessionsPanel silencia fallo de carga | ✅ Fijado |
| D-71 | 🟢 | UX | ClientsList muestra empty state falso cuando SWR falla | ✅ Fijado |
| D-72 | 🟢 | UX | EquipoView silencia fallos de sus 2 SWR | ✅ Fijado |
| D-73 | 🟢 | UX | PromptsManager ignora meta.error | ✅ Fijado |
| D-74 | 🟢 | UX | ClientTabs silencia errores de revalidación SWR | ✅ Fijado (onError + console.warn; fallbackData protege carga inicial) |

---

## Fijado en esta sesión (12 items)

- ✅ **D-58/D-67** — Middleware refactorizado externamente; comentario engañoso eliminado.
- ✅ **D-63** — ai-fill: `AbortSignal.timeout(270_000)` + catch `AbortError` retorna 504.
- ✅ **D-65** — ChatWindow.send(): `history.slice(-50)` para sesiones largas.
- ✅ **D-68** — PromptEditor: `swrError && !data` → banner de error.
- ✅ **D-69** — HistoryPanel: `swrError && !data` → banner + reintentar.
- ✅ **D-70** — ChatSessionsPanel: `error && !data` → banner + reintentar.
- ✅ **D-71** — ClientsList: `swrError && clients.length === 0` → banner de error.
- ✅ **D-72** — EquipoView: `teamError || projError` → banner de error.
- ✅ **D-73** — PromptsManager: `meta.error && !meta.data` → mensaje visible.
- ✅ **D-74** — ClientTabs: `onError` con `console.warn`; fallbackData mantiene UX.
- ✅ **feat** — Rename sesión de chat: PATCH endpoint + inline edit en ChatSessionsPanel.
- ✅ **D-60** — Marcado N/A: el diseño explícito del piloto es "todos los consultores comparten todos los clientes" (STACK.md, igual que D-29).

---

## Áreas sin hallazgos nuevos

- Auth cobertura: GET=`requireUser`, mutaciones=`requireAdmin`, cron=`verifyCron` ✅
- Streaming `/api/chat`: AbortController 45s, retry 529, rate limit 30msg/5min ✅
- Anti-IDOR: ownership check en stages/activities/materiality ✅
- Validación Zod en todos los inputs antes de DB ✅
- Prompt caching: 2 breakpoints ephemeral correctos ✅
- Anti-alucinación: `DEFAULT_BASE_RULES` incluye `[estimación]` y `[supuesto]` para los 4 roles ✅
- Model routing: Aurora/Rebeca/Elena=Sonnet, Valeria=Haiku ✅
- `extractJsonObject` balanced-brace parser ✅
- `logChange()` fail-open en audit log ✅

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable (decisión de negocio) |
| D-59 | 🟡 | Stale JWT admin demoted (aceptado para piloto) |
| D-61 | 🟡 | Rate limit in-memory ai-fill (aceptado para piloto) |
| D-66 | 🟡 | ChatWindow + QuestionnaireTab monolíticos |
| D-10 | 🟢 | Trazabilidad Chat→Cuestionario |
| D-64 | 🟢 | Estimado costo Sonnet-only |

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 9 — audit completo)
─────────────────────────────────────
✅ FIJADO EN ESTA SESIÓN (12 items)
─────────────────────────────────────
D-63 · ai-fill AbortSignal.timeout(270s) + catch 504
D-65 · ChatWindow history.slice(-50) — sesiones largas ya no rompen
D-68 · PromptEditor SWR error → banner (skeleton infinito eliminado)
D-69 · HistoryPanel SWR error → banner + reintentar
D-70 · ChatSessionsPanel SWR error → banner + reintentar
D-71 · ClientsList SWR error → banner (empty state falso eliminado)
D-72 · EquipoView SWR error → banner
D-73 · PromptsManager meta.error → mensaje visible
D-74 · ClientTabs SWR onError + console.warn
D-58/D-67 · Middleware comment resuelto (refactor externo)
feat · Rename sesión de chat (PATCH + inline edit lápiz/doble-click)

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
🟡 D-66 — Monolíticos >1000L (refactor gradual)
🟡 D-59 — Stale JWT (aceptado piloto)
🟡 D-61 — Rate limit multi-instancia (aceptado piloto)
🟡 D-04 — Metodología (decisión de negocio)
🟢 D-10, D-64

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.9 / 10 (sesiones 7+8)
Después → 9.6 / 10 (deuda restante aceptada para piloto; fixes aplicados)
Delta   → -0.3 (hallazgos nuevos parcialmente cerrados; residual es deuda consciente)
─────────────────────────────────────
```
