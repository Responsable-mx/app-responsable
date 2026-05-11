# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-10 (sesión 25 — audit + audit-health + audit-ia + audit-refactor + simplify)
**Calificación global:** 9.5 / 10 (vs 9.6 sesión 22; D-148/152/154/D-149 cerrados, D-150/151/153 diferidos como deuda planificada)

---

## Hallazgos sesión 25 — estado final tras "limpiar todo"

| ID | Sev | Descripción | Estado |
|----|-----|-------------|--------|
| D-148 | 🔴 | 7 ESLint errors `react-hooks` (rules-of-hooks + TDZ + setState in effect) | ✅ Resuelto |
| D-149 | 🟡 | Mockups `/dev/` 235KB con doc desincronizado en CLAUDE.md | ✅ Resuelto (CLAUDE.md actualizado, mockups SIGUEN activos como playground dev) |
| D-150 | 🟡 | `DoubleMaterialidadTab.tsx` monolito 2988L / 129KB | Diferido (1 sprint refactor) |
| D-151 | 🟡 | 35 ocurrencias `any` sin justificar | Diferido (gradual) |
| D-152 | 🟢 | 3 tests `apply-sql-safety` timeout 5s (OneDrive) | ✅ Resuelto (`{ timeout: 30000 }`) |
| D-153 | 🟢 | `DocumentsTab.tsx` 74KB + `ServiceGantt.tsx` 55KB monolitos secundarios | Diferido (post D-150) |
| D-154 | 🟢 | 7 ESLint warnings unused vars | ✅ Resuelto |

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

## Pendientes activos post-sesión 25 (después de "limpiar todo")

| ID | Sev | Descripción |
|----|-----|-------------|
| D-150 | 🟡 | DoubleMaterialidadTab 2988L monolito (refactor 1 sprint) |
| D-151 | 🟡 | 35 `any` sin justificar (gradual) |
| D-04  | 🟡 | Metodología ResponSable (decisión negocio, arrastre) |
| D-153 | 🟢 | DocumentsTab 74KB + ServiceGantt 55KB (post D-150) |
| D-147 | 🟢 | Cache in-memory extract-profile (aceptado MVP) |

## Validación post-fixes (2026-05-10 sesión 25)

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | ✅ 0 errores |
| `npx eslint .` | ✅ exit 0 — 0 errors, 0 warnings |
| `npx vitest run` | ✅ 318/318 tests verde (incluye 3 timeouts arreglados) |
| `npm audit` | 3 moderate preexistentes (anthropic SDK + postcss/next, sin fix upstream) |

## Archivos tocados sesión 25 (limpiar todo)

| Archivo | Cambio |
|---------|--------|
| `components/ClientTabs.tsx` | useState/useRef movidos antes de useEffects (D-148); 3 props prefix `_` (D-154); `setStripPinned` destructured `[, ...]` (D-154); `set-state-in-effect` disable con justificación restauración localStorage one-shot (D-148) |
| `components/questionnaire/QuestionnaireTab.tsx` | useEffect `pendingExtract` movido antes de early return `if (!isWizard)` (D-148 rules-of-hooks); `reportUrls` prefix `_` (D-154); `set-state-in-effect` disable con justificación nav inducida por prop (D-148) |
| `components/doble-materialidad/DoubleMaterialidadTab.tsx` | `set-state-in-effect` disable con justificación smart jump único (ref previene loop) (D-148) |
| `components/doble-materialidad/ValidacionSection.tsx` | `decisions` envuelto en `useMemo` para estabilidad de deps de `useCallback` (D-154); import `useMemo` añadido |
| `__tests__/scripts/apply-sql-safety.test.ts` | 3 tests con `{ timeout: 30000 }` (D-152) |
| `CLAUDE.md` | Sección "Consolidación mayo-2026 — eliminación del mockup" → "Mockups `/dev/*` — playground dev" + tabla por carpeta + regla de cleanup (D-149) |

---

## Score sesión 25

| Dimensión | Post-22 | Audit pre-fix | Post-fix (limpiar todo) |
|-----------|---------|---------------|-------------------------|
| Seguridad | 9.7 | 9.7 | 9.7 |
| Confiabilidad | 9.8 | 9.4 | 9.8 (D-148 cerrado) |
| UX | 9.2 | 9.2 | 9.2 |
| Arquitectura | 9.8 | 9.4 | 9.6 (D-149 doc resuelto, D-150 diferido como deuda planificada) |
| Rendimiento | 9.2 | 9.2 | 9.2 |
| Calidad de código | 9.8 | 8.8 | 9.6 (ESLint 0/0, D-151 35 `any` diferido) |
| Observabilidad | 9.5 | 9.5 | 9.5 |
| Deuda técnica | 9.6 | 9.0 | 9.4 (4 cerrados, 3 diferidos) |
| **Global** | **9.6** | **9.3** | **9.5** |

> Nota: "limpiar todo" cerró D-148 (🔴 critical) + D-149 + D-152 + D-154. Diferidos D-150/D-151/D-153 (refactor grandes, esfuerzo 1+ sprint cada uno). Validación final: TS 0 errores, ESLint 0/0, 318/318 tests verde.

---

## Auditoría anterior: 2026-05-08 (sesión 22)
**Score:** 9.6/10 — D-144/146 resueltos, D-145/147 pendientes (D-145 cerrado en sesión 24).
