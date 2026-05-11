# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-10 (sesión 26 — audit + audit-health + audit-ia + audit-refactor + simplify post-deploy)
**Calificación global:** 9.5 / 10 (vs 9.4 audit pre-fix; 4 hallazgos cerrados, 1 diferido)

---

## Hallazgos sesión 26 — estado final tras "limpiar y propagar todo"

| ID | Sev | Descripción | Estado |
|----|-----|-------------|--------|
| D-155 | 🟡 | 5 mutaciones DM-IA sin `logChange()` (dm-validacion + dm-config + dm-nis + dm-resumen + dm-benchmark PATCH) | ✅ Resuelto (7 handlers con audit log) |
| D-156 | 🟢 | `console.log` debug raw AI response 800 chars en dm-benchmark:419 | ✅ Resuelto |
| D-157 | 🟢 | ClientForm 686L + ClientsList 618L | Diferido (refactor con D-150) |

---

## Detalle D-155 — Audit log mutaciones DM-IA

**Patrón canónico aplicado**: CLAUDE.md "Audit log de mutaciones admin" extendido a **mutaciones consultor sobre entregables auditados externos**. Razón: Doble Materialidad IA es entregable cliente con escrutinio externo (auditor ESG, GRI, regulador). Cliente puede impugnar "¿quién cambió esta decisión IRO el 15 de agosto?" — sin trazabilidad no hay respuesta.

| Endpoint | Handler | Acción audit | Antes/Después |
|----------|---------|--------------|---------------|
| `dm-validacion/route.ts` | PATCH (upsert) | `update` o `create` | iro_decisions before, payload after |
| `dm-config/route.ts` | PATCH | `update` | dm_horizons before, merged after |
| `dm-nis/route.ts` | POST (genera desde cuestionario) | `create` | inserted_count + sector |
| `dm-nis/route.ts` | PATCH (edita fila) | `update` | ibso_key + estado/calidad/accion before+after |
| `dm-resumen/route.ts` | PATCH (review) | `review` | reviewed_at before/after |
| `dm-resumen/route.ts` | POST (genera) | `create` | model + latencyMs |
| `dm-benchmark/route.ts` | PATCH (rejection/reports_publicly) | `update` | updatePayload after |

`AuditEntityType` ya incluía `dm_validacion`, `dm_config`, `dm_nis`, `dm_resumen`, `dm_benchmark_company` — solo faltaba el call a `logChange()`.

---

## Áreas verificadas sin hallazgos nuevos sesión 26

| Área | Resultado |
|------|-----------|
| Cron security: `verifyCron(req)` en 4/4 + middleware bypass `Authorization: Bearer CRON_SECRET` | ✅ |
| `/clientes/[id]/page.tsx`: Promise.all 5 queries paralelas | ✅ |
| `/clientes/[id]/editar`: requireAdmin + redirect | ✅ |
| `/api/clients` GET: rate limit 60/min DB + listClientsLight catalog | ✅ |
| RBAC `requireConsultorForClient` en 13 endpoints DM-IA | ✅ |
| Services/stages GET con `requireUser` (alineado RLS abierto STACK.md) | ✅ |
| Sentry client+server con `release: VERCEL_GIT_COMMIT_SHA` | ✅ |
| Secrets: 0 leaks en client code | ✅ |
| Hardcoded URLs: solo User-Agent + fallbacks `process.env.X || "https://..."` | ✅ |
| `dm-export-iros`: ExcelJS server-side, requireConsultorForClient | ✅ |
| `freeze-baseline`: requireAdmin + logChange ✓ | ✅ |
| Auto-deploy push 8a3ed08 → app.responsable.net HTTP 200 | ✅ |

---

## Pendientes activos post-sesión 26

| ID | Sev | Descripción |
|----|-----|-------------|
| D-150 | 🟡 | DoubleMaterialidadTab 2988L monolito (refactor 1 sprint) |
| D-151 | 🟡 | 35 `any` sin justificar (gradual) |
| D-04  | 🟡 | Metodología ResponSable (decisión negocio, arrastre) |
| D-153 | 🟢 | DocumentsTab 74KB + ServiceGantt 55KB (post D-150) |
| D-157 | 🟢 | ClientForm 686L + ClientsList 618L (con D-150) |
| D-147 | 🟢 | Cache in-memory extract-profile (aceptado MVP) |

## Validación post-fixes (2026-05-10 sesión 26)

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | ✅ 0 errores |
| `npx eslint .` | ✅ exit 0 — 0 errors, 0 warnings |
| `npx vitest run` | ✅ 318/318 tests verde |

## Archivos tocados sesión 26

| Archivo | Cambio |
|---------|--------|
| `app/api/clients/[id]/dm-benchmark/route.ts` | rm console.log debug L419 (D-156) + import logChange + PATCH `update` audit (D-155) |
| `app/api/clients/[id]/dm-validacion/route.ts` | import logChange + PATCH `update`/`create` audit con before iro_decisions (D-155) |
| `app/api/clients/[id]/dm-config/route.ts` | import logChange + PATCH `update` audit con before/after dm_horizons (D-155) |
| `app/api/clients/[id]/dm-nis/route.ts` | import logChange + POST `create` audit + PATCH `update` audit con before fila (D-155) |
| `app/api/clients/[id]/dm-resumen/route.ts` | import logChange + PATCH `review` audit + POST `create` audit con model/latency (D-155) |

## Score sesión 26

| Dimensión | Audit pre-fix | Post-fix |
|-----------|---------------|----------|
| Seguridad | 9.7 | 9.7 |
| Confiabilidad | 9.7 | 9.8 (D-156 leak removido) |
| UX | 9.2 | 9.2 |
| Arquitectura | 9.6 | 9.6 |
| Rendimiento | 9.2 | 9.2 |
| Calidad de código | 9.6 | 9.6 |
| Observabilidad | 9.3 | 9.6 (D-155 7 audit logs nuevos) |
| Deuda técnica | 9.1 | 9.4 (2 cerrados, 1 diferido) |
| **Global** | **9.4** | **9.5** |

---

## Auditoría anterior: 2026-05-10 (sesión 25)
**Score post-cleanup:** 9.5/10 — D-148 hooks + D-149 doc + D-152 timeout + D-154 unused vars cerrados.
