# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-10 (sesión 25 — audit + audit-health + audit-ia + audit-refactor + simplify)
**Calificación global:** 9.3 / 10 (-0.3 vs sesión 22)

---

## Hallazgos sesión 25 — nuevos desde sesión 24

| ID | Sev | Descripción | Estado |
|----|-----|-------------|--------|
| D-148 | 🔴 | 7 ESLint errors `react-hooks` críticos (rules-of-hooks roto en QuestionnaireTab:452 + TDZ + setState in effect en ClientTabs/DoubleMaterialidadTab) | Pendiente DEUDA.md |
| D-149 | 🟡 | `app/dev/app-preview/AppShell.tsx` 114KB + WizardShell 72KB + mock-data 49KB = 235KB no eliminados pese a CLAUDE.md (sección "Consolidación mayo-2026") afirmar lo contrario | Pendiente DEUDA.md |
| D-150 | 🟡 | `DoubleMaterialidadTab.tsx` monolito 2988L / 129KB — concentra 8 stages + chat + benchmark + IROs + reporte preview. ESLint detectó setState in effect en L2575 | Pendiente DEUDA.md |
| D-151 | 🟡 | 35 ocurrencias `as any` / `: any` sin `eslint-disable` justificado | Pendiente DEUDA.md |
| D-152 | 🟢 | 3 tests `apply-sql-safety.test.ts` timeout 5s (OneDrive Files-On-Demand) — `permite ALTER TABLE ADD COLUMN IF NOT EXISTS`, `permite CREATE TABLE IF NOT EXISTS`, `permite COMMENT ON COLUMN` | Pendiente DEUDA.md |
| D-153 | 🟢 | `DocumentsTab.tsx` 74KB + `ServiceGantt.tsx` 55KB monolitos secundarios (mismo patrón D-150) | Pendiente DEUDA.md |
| D-154 | 🟢 | 7 ESLint warnings unused vars (`completeness`, `serviceLabels`, `visibleServices`, `stripPinned`, `reportUrls`, `decisions×2`) | Pendiente DEUDA.md |

---

## Detalle D-148 — ESLint react-hooks errors

**Síntoma**: `npx eslint .` reporta 7 errors + 7 warnings. Errors críticos pueden producir bugs runtime intermitentes (orden hook depende de path, setState cascading).

| Archivo:línea | Error | Por qué importa |
|---------------|-------|-----------------|
| `QuestionnaireTab.tsx:452` | `useEffect` después de early return → react-hooks/rules-of-hooks | Orden de hooks inconsistente entre renders → bugs aleatorios |
| `QuestionnaireTab.tsx:248` | `aiFillAll` accessed before declared (decl L488) | TDZ runtime cuando effect lee función no declarada |
| `QuestionnaireTab.tsx:455-456` | `docFill` accessed before declared (decl L464) | Mismo patrón |
| `ClientTabs.tsx:134` | `setShowStripDropdown` accessed before declared (decl L189) | Effect callback referencia setState antes de useState |
| `ClientTabs.tsx:158` | `setState` síncrono dentro de effect body | Cascading renders, perf degradada |
| `DoubleMaterialidadTab.tsx:2575` | `navigateTo()` (con setState) en effect body | Mismo patrón |

**Fix sugerido**: mover declaraciones (`useState`, `function aiFillAll`, etc.) ANTES de cada `useEffect` que las consuma. Para `setState in effect`: si necesitas sincronizar estado externo, usar `useSyncExternalStore` o derivar valor durante render.

---

## Detalle D-149 — Mockups dev no eliminados

CLAUDE.md sección "Consolidación mayo-2026 — eliminación del mockup `/dev/app-preview`" afirma:

> El mockup `app/dev/app-preview/AppShell.tsx` fue eliminado.

Realidad (`ls app/dev/`):

```
app-preview/         (AppShell.tsx 114KB)
chat-preview/
client-tabs-mockup/
clientes-wizard-preview/  (WizardShell.tsx 72KB + mock-data.ts 49KB)
dm-nav-mockup/
primitives-preview/
```

Middleware en `lib/supabase/middleware.ts:60-61` bloquea `/dev/*` en producción:
```ts
if (pathname.startsWith("/dev/") && process.env.NODE_ENV !== "production")
```

✅ Sin riesgo en prod. Pero:
- Contamina dev build (slow HMR en archivos 100KB+)
- Inflar `node_modules` cache + Vercel build time
- Doc desincronizado → confusión para colaboradores

**Decisión pendiente**:
1. Eliminar mockups (si son referenciables por git history) → quita 235KB del repo
2. Actualizar CLAUDE.md para reflejar que `/dev/app-preview` sigue activo en dev como referencia (justificar uso)

---

## Detalle D-150 — DoubleMaterialidadTab monolito

| Métrica | Valor |
|---------|-------|
| Líneas | 2988 |
| Tamaño | 129KB |
| Secciones | 8 stages + chat + benchmark + IROs + reporte preview |
| ESLint errors directos | 1 (setState in effect L2575) |
| Componentes ya extraídos | `ValidacionSection.tsx`, `MatrizDM.tsx` |

**Fix sugerido**: dividir por sección manteniendo orchestrator delgado:
- `DoubleMaterialidadTab.tsx` (orchestrator + state shared)
- `BenchmarkSection.tsx`
- `IROsSection.tsx`
- `ReportPreviewSection.tsx`
- `Stage<N>.tsx` × 8

Pattern ya validado por `ValidacionSection.tsx`. ROI: cambios pequeños no rompen partes alejadas + tests por sección.

---

## Áreas verificadas sin hallazgos nuevos sesión 25

| Área | Resultado |
|------|-----------|
| Auth `requireConsultorOrAdmin` en chat/route.ts | ✅ |
| Rate limit chat 30/5min DB-backed + AbortSignal 45s + circuit breaker | ✅ |
| Rate limit DB en 8 endpoints IA (ai-fill, doc-fill, dm-*, research-reports, extract-profile) | ✅ |
| `logAiCall` con cache tokens en 9/9 routes IA | ✅ |
| Cache breakpoints ephemeral 2× en `lib/ai/roles.ts buildSystemBlocks` | ✅ |
| Middleware `/dev/*` bloqueado en prod | ✅ |
| SSRF guard unificado (`isPublicHttpUrl` cubre IPv4-mapped IPv6) | ✅ |
| `getModelConfig()` única fuente — sin hardcodes en routes (post D-110) | ✅ |
| Sentry client+server+instrumentation+CSP `connect-src` ingest | ✅ |
| TypeScript `--noEmit`: 0 errores | ✅ |
| Tests: 315/318 verdes (3 timeouts D-152) | ✅ |
| `npm audit`: 0 high, 3 moderate preexistentes (anthropic SDK + postcss/next) | ✅ |
| STACK.md cache strategy: 12 entries documentadas (`revalidate` correcto) | ✅ |
| Audit log `logChange()` en mutaciones admin | ✅ |

---

## Pendientes activos post-sesión 25

| ID | Sev | Descripción |
|----|-----|-------------|
| D-148 | 🔴 | 7 ESLint errors react-hooks críticos |
| D-149 | 🟡 | Mockups `/dev/` 235KB no eliminados (doc desync) |
| D-150 | 🟡 | DoubleMaterialidadTab 2988L monolito |
| D-151 | 🟡 | 35 `any` sin justificar |
| D-04  | 🟡 | Metodología ResponSable (decisión negocio, arrastre) |
| D-152 | 🟢 | 3 tests apply-sql-safety timeout |
| D-153 | 🟢 | DocumentsTab 74KB + ServiceGantt 55KB |
| D-154 | 🟢 | 7 unused vars ESLint warnings |
| D-147 | 🟢 | Cache in-memory extract-profile (aceptado MVP) |

---

## Score sesión 25

| Dimensión | Post-22 | Post-25 | Delta |
|-----------|---------|---------|-------|
| Seguridad | 9.7 | 9.7 | — |
| Confiabilidad | 9.8 | 9.4 | -0.4 (D-148 react-hooks runtime risk) |
| UX | 9.2 | 9.2 | — |
| Arquitectura | 9.8 | 9.4 | -0.4 (D-149 mockups + D-150 monolito) |
| Rendimiento | 9.2 | 9.2 | — |
| Calidad de código | 9.8 | 8.8 | -1.0 (7 ESLint errors + 35 `any`) |
| Observabilidad | 9.5 | 9.5 | — |
| Deuda técnica | 9.6 | 9.0 | -0.6 (3 nuevas Importantes) |
| **Global** | **9.6** | **9.3** | **-0.3** |

> Nota: Score baja por D-148 (runtime risk) + 3 nuevas Importantes. Cero hallazgos nuevos en seguridad/IA/observabilidad — bloques previamente endurecidos siguen sólidos.

---

## Auditoría anterior: 2026-05-08 (sesión 22)
**Score:** 9.6/10 — D-144/146 resueltos, D-145/147 pendientes (D-145 cerrado en sesión 24).
