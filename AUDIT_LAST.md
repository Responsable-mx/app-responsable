# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-06 (sesión 19 — audit completo: seg, IA, health, refactor, simplify)
**Calificación global:** 9.1 / 10 (sesión 19 extended — D-125–D-131 cerrados, hacia 9.5)

---

## Hallazgos sesión 19 — TODOS RESUELTOS

| ID | Sev | Descripción | Estado |
|----|-----|-------------|--------|
| D-125 | 🟢 | `ConsultorSwimlane.tsx` dead code (355L, 0 consumidores) | ✅ Eliminado |
| D-126 | 🟢 | `createAnthropicClient()` ausente — 6 rutas con `new Anthropic()` inline | ✅ Factory creada + rutas migradas |
| D-127 | 🟡 | `PATCH /api/clients/[id]` `logChange` sin `before` snapshot | ✅ Snapshot antes de mutación |
| D-128 | 🟢 | `POST /api/clients` sin `logChange` | ✅ Audit trail agregado |
| D-129 | 🟡 | CSP `unsafe-eval` en producción | ✅ Eliminado de `next.config.ts` |
| D-130 | 🟢 | Sentry sin `release` tag — sin correlación deploy↔errores | ✅ `release=VERCEL_GIT_COMMIT_SHA` + source maps condicionales |

### Fixes adicionales sesión 19

| Tipo | Descripción | Archivo |
|------|-------------|---------|
| TS error | `(data as ClientMini)` → `(data as unknown as ClientMini)` | `lib/clients.ts:301` |
| TS error | `z.record(z.boolean())` → `z.record(z.string(), z.boolean())` | `lib/validation.ts:52` |
| ESLint | Dead `RELATION_LABELS` import | `dm-report/route.ts` |
| ESLint | Unused `useSWR` import | `ChatWindow.tsx` |
| ESLint | Dead `INTRO` constant | `EquipoView.tsx` |
| ESLint | Dead `STATUS_BAR` constant | `GlobalTimeline.tsx` |
| ESLint | Unescaped `"` en JSX | `UsersManager.tsx:437` |
| ESLint | Unused `mutate` import | `DoubleMaterialidadTab.tsx` |
| ESLint | Stale `eslint-disable-next-line` comments (×2) | `ImportModal.tsx` |
| Refactor | `checkAiRateLimit()` DRY — 4 rutas AI migradas | `lib/ai/rate-limit.ts` |
| Refactor | `lib/timeline/utils.ts` — 160L de utils puras extraídas de GlobalTimeline | `lib/timeline/utils.ts` |
| Cache | `Cache-Control: private, no-store` en questionnaire GET | `questionnaire/route.ts` |
| Cache | `Cache-Control: private, max-age=30, swr=120` en materiality GET | `materiality/route.ts` |

---

## Resueltos en sesión 18 (confirmados)

| ID | Descripción |
|----|-------------|
| D-121 | RBAC bypass export-pdf + export-cronograma-pdf |
| D-122 | dm-report POST sin rate limit |
| D-123 | research-reports POST sin rate limit |
| D-124 | audit-health cron pricing fijo → model-aware |
| D-85  | Sidebar "MIS PROYECTOS" dead SWR → eliminado |

---

## Pendientes de ciclos anteriores

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable — decisión de negocio |

---

## Áreas sin hallazgos nuevos sesión 19

| Área | Resultado |
|------|-----------|
| `lib/auth.ts` — jerarquía guards (5 funciones) | ✅ |
| `app/api/extract-test` — auth + rate limit 20/5min | ✅ |
| `export-dm-pdf/route.ts` — requireConsultorForClient | ✅ |
| `freeze-baseline/route.ts` — requireAdmin | ✅ |
| `ChatWindow.tsx` (837L) — 3 sub-components extraídos | ✅ |
| `QuestionnaireTab.tsx` (1254L) — WizardEditor + 3 sub-components | ✅ |
| Model routing Haiku/Sonnet/Opus por rol | ✅ |
| Prompt caching (2 breakpoints ephemeral) | ✅ |
| RBAC `requireConsultorForClient` en endpoints de datos | ✅ |
| SSRF guard `ingest-report` | ✅ |
| Crons `verifyCron` (4 crons) | ✅ |

---

## Evolución de calificación sesión 19

| Dimensión | Pre-sesión 19 | Post-sesión 19 | Delta |
|-----------|---------------|----------------|-------|
| Seguridad | 8.3 | 9.0 | +0.7 (D-129 CSP unsafe-eval eliminado) |
| Confiabilidad | 8.0 | 8.5 | +0.5 (retry factory + timeout) |
| UX | 7.5 | 7.5 | — |
| Arquitectura | 7.0 | 8.5 | +1.5 (rate-limit DRY, factory, utils split, dead code) |
| Rendimiento | 7.5 | 8.0 | +0.5 (cache headers) |
| Calidad de código | 8.0 | 9.0 | +1.0 (zero TS errors, zero ESLint warnings) |
| Observabilidad | 7.8 | 8.5 | +0.7 (audit trail PATCH, Sentry release tag) |
| Deuda técnica | 8.0 | 9.0 | +1.0 (todos D-12x cerrados) |
| **Global** | **8.0** | **8.7** | **+0.7** |

---

## Sesión 19 extended — items adicionales hacia 9.5

| ID | Tipo | Descripción | Estado |
|----|------|-------------|--------|
| D-131 | Obs | SentryUserContext: setUser(email) post-auth | ✅ |
| D-132 | Obs | /configuracion/auditoria: tabla 200 mutaciones admin + diff | ✅ |
| D-133 | Perf | content-visibility:auto en filas GlobalTimeline (virtual scroll nativo) | ✅ |
| D-134 | Arq | TimelineChartRow extraído como React.memo (877L → 766L) | ✅ |
| D-135 | UX | Esc cierra popover materialidad desde cualquier foco | ✅ |
| D-136 | Código | noUncheckedIndexedAccess intentado — 198 errores en codebase existente, documentado para sprint futuro | ⏸ deferido |

## Gap hasta 9.5

| Dimensión | Post-19ext | Gap a 9.5 | Acción mínima |
|-----------|------------|-----------|---------------|
| UX | 8.0 | 1.5 | Playwright E2E wizard AI-fill (flujo crítico sin tests) |
| Confiabilidad | 8.5 | 1.0 | Playwright E2E; degradación elegante si Anthropic 503 persistente |
| Arquitectura | 9.0 | 0.5 | QuestionnaireTab sub-components a archivos separados |
| Observabilidad | 9.2 | 0.3 | SENTRY_AUTH_TOKEN en Vercel → source maps reales |
| Código | 9.0 | 0.5 | noUncheckedIndexedAccess en sprint dedicado |
| Rendimiento | 8.8 | 0.7 | Bundle audit: pdf-parse/exceljs en routes lazy |
| Seguridad | 9.0 | 0.5 | Rate limit GET /api/clients (vía tabla propia, no ai_calls) |

---

## Auditoría anterior: 2026-05-06 (sesión 18)
**Score post-fix:** 8.1/10
