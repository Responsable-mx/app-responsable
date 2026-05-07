# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-06 (sesión 17 — auditoría completa: IA, seguridad, arquitectura, rendimiento, UX)
**Calificación global:** 7.6 / 10

---

## Hallazgos nuevos (no en DEUDA.md al inicio de sesión)

| ID | Sev | Descripción | Archivo |
|----|-----|-------------|---------|
| D-109 | 🟡 | Fallback Sonnet stale `claude-sonnet-4-20250514` en 5 lugares — app corre en Sonnet 4 en lugar de Sonnet 4.6 si env var apunta al ID viejo | `lib/ai/models.ts:27,33`, `lib/ai/extract-test.ts:13`, `dm-benchmark/route.ts:172`, `dm-report/route.ts:155`, `env.example:20` |
| D-110 | 🟡 | `dm-benchmark` y `dm-report` hardcodean model lookup propio — no usan `getModelConfig()` — config de modelo en 3 fuentes distintas | `dm-benchmark/route.ts:172`, `dm-report/route.ts:155` |
| D-111 | 🟡 | `dm-benchmark` POST sin rate limit — propose (4 web_search) + compare (Sonnet 150s) sin conteo en ai_calls | `dm-benchmark/route.ts` |
| D-112 | 🟡 | `logAiCall` sin `cacheCreationTokens`/`cacheReadTokens` en dm-benchmark y dm-report — dashboard uso-IA subreporta costos | `dm-benchmark/route.ts:211,215,314,319`, `dm-report/route.ts:183,187` |
| D-113 | 🟡 | `ai-fill` llama `getClient(id)` dos veces (líneas 101 y 157) — 2 DB round-trips para la misma fila | `ai-fill/route.ts:101,157` |
| D-114 | 🟢 | Middleware: cron bypass ocurre después de `auth.getUser()` — round-trip Supabase innecesario en cada cron | `lib/supabase/middleware.ts:42-56` |
| D-115 | 🟢 | DEUDA.md stale: D-86/D-87/D-88 resueltos en código pero no tachados. D-85 "Acceso rápido" renombrado pero lógica aún presente | `DEUDA.md` |

---

## Resueltos confirmados en código (sesiones anteriores, no en DEUDA.md)

| ID | Descripción | Verificación |
|----|-------------|--------------|
| D-86 | Cronograma h2 redundante eliminado | `ClientCronogramaTab.tsx` — no hay `CRONOGRAMA DEL CLIENTE` |
| D-87 | Copy "IA llena 7 pasos" → `{aiCapableCount} de {totalSteps}` | `AiBulkBanner.tsx:42` |
| D-88 | Label "ADMIN" eliminado de page headers | `equipo/page.tsx:12`, `configuracion/layout.tsx:26` |

---

## Pendientes de ciclos anteriores (sin cambio de severidad)

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable — decisión de negocio |
| D-85 | 🟢 | "Acceso rápido" sidebar — lógica aún activa, pendiente de pin en lista de clientes |

---

## Áreas sin hallazgos nuevos

| Área | Resultado |
|------|-----------|
| Auth guards todos los endpoints | ✅ `requireConsultorForClient` en wizard, docs, materiality, benchmark, dm-report |
| Seguridad headers CSP/HSTS | ✅ `next.config.ts` completo |
| SSRF guard + magic bytes | ✅ `ingest-report` + `isPublicHttpUrl` |
| Rate limit chat / ai-fill / doc-fill | ✅ DB-based cross-instance |
| Prompt caching chat (2 breakpoints) | ✅ `buildSystemBlocks` ephemeral correcto |
| Opus 4 en Elena / Haiku 4.5 en Valeria | ✅ IDs correctos en `models.ts` |
| Audit log mutaciones admin | ✅ `logChange` en todos los endpoints admin |
| `extractJsonObject` centralizado | ✅ `lib/ai/extract-json.ts` — 5 importaciones |
| RBAC consultor-per-client | ✅ `requireConsultorForClient` en 9+ endpoints |
| Tests | ✅ suite 246+ tests |
| Crons `verifyCron` | ✅ 4 crons protegidos |
| SWR retry global | ✅ `DashboardSWRProvider` exponencial |

---

## Evolución de calificación

| Dimensión | Anterior | Ahora |
|-----------|---------|-------|
| Seguridad | 8.5 | 8.5 |
| Confiabilidad | 8.0 | 7.5 |
| UX | 7.0 | 7.5 |
| Arquitectura | 7.5 | 7.0 |
| Rendimiento | 8.0 | 7.5 |
| Calidad de código | 7.5 | 7.5 |
| Observabilidad | 8.5 | 7.5 |
| Deuda técnica | 7.0 | 7.5 |
| **Global** | **7.8** | **7.6** |

> Baja leve: observabilidad pierde por cache tokens faltantes en dm-benchmark/report; arquitectura pierde por config modelo en 3 fuentes.
> Sube UX (D-86/87/88 confirmados resueltos) y deuda técnica (pocos ítems activos reales).

---

## Auditoría anterior: 2026-05-06 (sesión 16)
**Score:** 7.8/10
