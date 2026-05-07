# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-06 (sesión 19 — audit completo: seg, IA, health, refactor, simplify)
**Calificación global:** 8.1 / 10 (entrada sesión 19, post-fixes sesión 18)

---

## Hallazgos nuevos sesión 19

| ID | Sev | Descripción | Archivo |
|----|-----|-------------|---------|
| D-127 | 🟡 | `PATCH /api/clients/[id]` `logChange` sin `before` snapshot — audit trail incompleto para updates de cliente | `app/api/clients/[id]/route.ts:51–68` |
| D-129 | 🟡 | CSP `unsafe-eval` en producción — `script-src` incluye `unsafe-eval` que habilita XSS por eval | `next.config.ts:20` |
| D-125 | 🟢 | `ConsultorSwimlane.tsx` dead code (355L, 0 consumidores) — CLAUDE.md dice "eliminado" | `components/config/ConsultorSwimlane.tsx` |
| D-126 | 🟢 | `mockup-timeline-swimlane.html` en raíz del repo (20KB, untracked) | `/mockup-timeline-swimlane.html` |
| D-128 | 🟢 | `POST /api/clients` sin `logChange` — crear cliente no deja audit trail | `app/api/clients/route.ts` |

---

## Resueltos en sesión 18 (confirmados)

| ID | Descripción |
|----|-------------|
| D-121 | RBAC bypass export-pdf + export-cronograma-pdf → `requireConsultorForClient` |
| D-122 | dm-report POST sin rate limit → 3/5min DB-based |
| D-123 | research-reports POST sin rate limit → 5/5min DB-based |
| D-124 | audit-health cron pricing fijo → model-aware (Haiku/Sonnet/Opus) |
| D-85  | Sidebar "MIS PROYECTOS" dead SWR → eliminado (~84 líneas, import useSWR removido) |

---

## Pendientes de ciclos anteriores (sin cambio de severidad)

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
| Resto headers `next.config.ts` (X-Frame, HSTS, Referrer, Permissions) | ✅ |
| `ChatWindow.tsx` (837L) — 3 sub-components extraídos | ✅ |
| `QuestionnaireTab.tsx` (1254L) — WizardEditor + 3 sub-components | ✅ |
| Model routing Haiku/Sonnet/Opus por rol | ✅ |
| Prompt caching (2 breakpoints ephemeral) | ✅ |
| Rate limit chat / ai-fill / doc-fill / dm-benchmark / dm-report / research-reports | ✅ |
| RBAC `requireConsultorForClient` en endpoints de datos | ✅ |
| SSRF guard `ingest-report` | ✅ |
| Crons `verifyCron` (4 crons) | ✅ |

---

## Evolución de calificación

| Dimensión | Sesión 18 pre-fix | Sesión 18 post-fix | Sesión 19 (hallazgos) |
|-----------|-------------------|--------------------|-----------------------|
| Seguridad | 7.5 | 8.5 | 8.3 (D-129 CSP) |
| Confiabilidad | 8.0 | 8.0 | 8.0 |
| UX | 7.5 | 7.5 | 7.5 |
| Arquitectura | 7.0 | 7.0 | 7.0 (D-125 dead code) |
| Rendimiento | 7.5 | 7.5 | 7.5 |
| Calidad de código | 8.0 | 8.0 | 8.0 |
| Observabilidad | 7.5 | 8.0 | 7.8 (D-127/D-128 audit trail) |
| Deuda técnica | 7.5 | 8.0 | 8.0 |
| **Global** | **7.8** | **8.1** | **8.0** |

---

## Auditoría anterior: 2026-05-06 (sesión 18)
**Score post-fix:** 8.1/10
