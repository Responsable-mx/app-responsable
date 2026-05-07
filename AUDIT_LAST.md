# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-06 (sesión 18 — auditoría completa: IA, seguridad, health, refactor)
**Calificación global:** 7.8 / 10

---

## Hallazgos nuevos (no en DEUDA.md al inicio de sesión 18)

| ID | Sev | Descripción | Archivo |
|----|-----|-------------|---------|
| D-121 | 🔴 | RBAC bypass en export-pdf y export-cronograma-pdf — usan `requireUser()` en lugar de `requireConsultorForClient(id)`. Cualquier consultor puede descargar PDF de cualquier cliente. | `export-pdf/route.ts:36`, `export-cronograma-pdf/route.ts:25` |
| D-122 | 🟡 | `dm-report` POST sin rate limit — Elena (Opus $5/$25) sin throttle. `dm-benchmark` sí tiene rate limit (D-111) pero `dm-report` se omitió | `dm-report/route.ts` |
| D-123 | 🟡 | `research-reports` POST sin rate limit — Aurora + web_search (3 usos) sin throttle por usuario | `research-reports/route.ts` |
| D-124 | 🟢 | `audit-health` cron usa precios Sonnet fijos ($3/$15) para todos los modelos — Elena (Opus) se subestima, Valeria (Haiku) se sobreestima. `lib/ai/usage.ts` ya tiene pricing por modelo. | `cron/audit-health/route.ts:51–53` |

---

## Resueltos ANTES de esta sesión (limpieza D-116–D-120 + coverage sprint)

| ID | Descripción |
|----|-------------|
| D-116 | audit log `activities/[activityId]` PATCH — before-snapshot añadido |
| D-117 | WorkloadHeatmap SWR error state visible |
| D-118 | ImportModal library tab `docsError` visible |
| D-120 | `documents` GET/POST: `Promise.all([requireConsultorForClient, getClient])` |
| coverage | 3 describe blocks nuevos: `isSystemAccount` / `getUserRoles` / `recordLogin` — 289 tests, 90.22% stmts |

---

## Pendientes de ciclos anteriores (sin cambio de severidad)

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable — decisión de negocio |
| D-85 | 🟢 | "MIS PROYECTOS" sidebar — duplica nav de clientes |

---

## Áreas sin hallazgos nuevos

| Área | Resultado |
|------|-----------|
| Crons `verifyCron` (4 crons) | ✅ dialy-qa, delayed-activities, refresh-reports, audit-health |
| Model routing por rol | ✅ `getModelConfig()` en todos los endpoints IA |
| Prompt caching chat (2 breakpoints) | ✅ `buildSystemBlocks` ephemeral correcto |
| Rate limit chat / ai-fill / doc-fill / dm-benchmark | ✅ DB-based cross-instance |
| Audit log mutaciones admin | ✅ `logChange` + before-snapshot en todos los endpoints |
| SSRF guard magic bytes | ✅ `ingest-report` + `isPublicHttpUrl` |
| RBAC `requireConsultorForClient` en endpoints de datos | ✅ 9+ endpoints correctos |
| Cron killswitches env | ✅ `DISABLE_DELAYED_NOTIFICATIONS` en delayed-activities |
| CSP/HSTS headers | ✅ `next.config.ts` |
| materiality-topics IDOR guard | ✅ D-12 pattern — `getMaterialityTopicVerified(topicId, clientId)` |

---

## Evolución de calificación

| Dimensión | Sesión 17 | Sesión 18 |
|-----------|-----------|-----------|
| Seguridad | 8.5 | 7.5 (D-121 RBAC activo) |
| Confiabilidad | 7.5 | 8.0 (D-116–D-120 resueltos) |
| UX | 7.5 | 7.5 |
| Arquitectura | 7.0 | 7.0 |
| Rendimiento | 7.5 | 7.5 |
| Calidad de código | 7.5 | 8.0 (coverage subió a 90%) |
| Observabilidad | 7.5 | 7.5 |
| Deuda técnica | 7.5 | 7.5 |
| **Global** | **8.0** | **7.8** |

> Baja seguridad: D-121 RBAC bypass activo en 2 rutas PDF.
> Sube confiabilidad y calidad: error states completos, 289 tests, coverage >90%.

---

## Auditoría anterior: 2026-05-06 (sesión 17)
**Score:** 8.0/10
