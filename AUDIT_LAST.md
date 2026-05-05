# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 4 — auditoría completa post-sprint)
**Modo:** /audit completo
**Calificación:** 9.4 / 10

---

## Hallazgos — todos cerrados en sesión

| ID | Sev | Descripción | Fix |
|----|-----|-------------|-----|
| D-42 | 🟡 | `client-services` PATCH/DELETE con `requireUser` — consultor podía mutar servicios | `requireAdmin()` en PATCH y DELETE |
| D-43 | 🟡 | RLS de `service_stages`/`stage_activities` sin check de rol admin | Migración `0033`: políticas mutación restringidas a `role = 'admin'` |
| D-44 | 🟢 | Doble `requireAdmin()` en PATCH activities (2 round-trips) | Variable compartida `adminEmail` — 1 sola llamada |
| D-45 | 🟢 | `ClientCronogramaTab` SWR sin `error` — fallo silencioso | `servicesError` desestructurado + banner de error visible |
| D-46 | 🟢 | `ServiceStagesPanel` sin `error` SWR + spinner texto en lugar de Skeleton | `error` + skeleton animado + mensaje de error |
| D-47 | 🟢 | `ClientServicesTab` usaba clase raw `.skeleton` | Resuelto al eliminar archivo (D-53) |
| D-48 | 🟢 | `StageRow` prop `consultorEmails` declarado pero no consumido | Eliminado del tipo y del call site |
| D-49 | 🟢 | `{stages.length === 0 && !isAdmin && null}` — expresión dead-null | Eliminada |
| D-50 | 🟢 | Iconos emoji en UI de datos en `ClientServicesTab` | Resuelto al eliminar archivo (D-53) |
| D-51 | 🟢 | `await import("zod")` dinámico en handler POST | Import estático `import { z } from "zod"` |
| D-52 | 🟢 | PATCH `/api/stages/:id` sin snapshot `before` en audit log | Fetch `before` previo al update |
| D-53 | 🟢 | `ClientServicesTab` dead code — 0 consumers | Archivo eliminado |

---

## Áreas sin hallazgos nuevos

- Auth en todas las rutas (GET=requireUser, mutaciones=requireAdmin) ✅
- UUID regex en todos los handlers ✅
- Zod validation antes de DB ✅
- Anti-IDOR: ownership checks en stages y activities ✅
- audit_log en todas las mutaciones ✅
- Índices DB: `idx_service_stages_service`, `idx_stage_activities_stage`, `idx_stage_activities_assignee`, `idx_stage_activities_planned_range` ✅
- Constraints DB: `chk_planned_dates`, `chk_actual_dates` ✅
- Tests: 216/216 verdes ✅
- ESLint: 0 errores, 0 warnings ✅
- TypeScript: 0 errores ✅

---

## Deuda activa (sin cambios)

- D-04 — Metodología ResponSable: decisión de negocio pendiente
- D-10 — Trazabilidad Chat→Cuestionario: diferido

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 4)
─────────────────────────────────────
✅ CERRADO EN ESTA SESIÓN
─────────────────────────────────────
D-42 auth gap — consultores mutaban servicios sin ser admin
D-43 RLS sin admin check — defensa en profundidad rota en service_stages/activities
D-44 doble round-trip Supabase — colapsado a 1 llamada
D-45 error silencioso ClientCronogramaTab — banner visible
D-46 spinner texto + error silencioso ServiceStagesPanel — skeleton + banner
D-47 clase CSS raw — eliminado con archivo muerto
D-48 prop dead consultorEmails en StageRow — eliminado
D-49 expresión null muerta en JSX — eliminada
D-50 emoji en UI de datos — eliminado con archivo muerto
D-51 dynamic import zod — import estático
D-52 audit log sin before snapshot — fetch + before en logChange
D-53 ClientServicesTab dead code — eliminado

─────────────────────────────────────
⏳ PENDIENTE
─────────────────────────────────────
D-04 — Metodología (decisión de negocio)
D-10 — Trazabilidad Chat→Cuestionario (diferido)

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.1 / 10
Después → 9.4 / 10
Mejora  → +0.3 (auth D-42/D-43 + calidad código)
─────────────────────────────────────
```
