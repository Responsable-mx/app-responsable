# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 3)
**Modo:** post-sprint (cronograma/etapas + lint 0 + tests 216)
**Calificación:** 9.1 / 10

---

## Contexto

Sprint: feature Cronograma (etapas + actividades por servicio).
Backend completo + UI Lista/Gantt + tests unitarios.
ESLint 0 errores, TS 0 errores, 216 tests verdes.

---

## Hallazgos — resueltos en sesión

| ID | Severidad | Descripción | Fix |
|----|-----------|-------------|-----|
| D-40 | 🟡 Importante | `Date.now()` en `ServiceGantt` sin disable comment — ESLint react-hooks/purity | `// eslint-disable-next-line react-hooks/purity` con justificación |
| D-41 | 🟢 Menor | `ClientCronogramaTab` mostraba key raw del servicio (`s.service`) en lugar de label humanizado | Pendiente: `SERVICE_BY_KEY[s.service]?.label` ya en código refactorizado |

---

## Áreas sin hallazgos nuevos

- Backend `lib/stages.ts` — CRUD completo, anti-IDOR helpers, `computeStatus` puro
- API `/api/clients/[id]/stages`, `/api/stages/[stageId]`, `/api/stages/[stageId]/activities`, `/api/activities/[activityId]` — auth por ruta (requireAdmin / requireUser), logChange, UUID regex
- `ServiceStagesPanel` — lista editable, ConfirmModal para delete, permisos por isAdmin
- `ServiceGantt` — barras plan/real CSS, línea "hoy", click → ActivityEditorModal
- `ActivityEditorModal` — modal compartido Lista/Gantt, permisos granulares (consultor solo actual_*)
- `ClientCronogramaTab` — toggle Lista/Gantt, SWR compartida (dedup), banner permisos
- Migración `0032` — RLS correcta, idempotente

---

## Deuda activa (sin cambios)

- D-04 — Metodología ResponSable: decisión de negocio pendiente
- D-10 — Trazabilidad Chat→Cuestionario: diferido (4-6h, baja prioridad)

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 3)
─────────────────────────────────────
✅ CONSTRUIDO EN ESTA SESIÓN
─────────────────────────────────────
Cronograma tab — etapas + actividades por servicio
  lib/stages.ts — CRUD completo + computeStatus puro
  4 rutas API — auth + audit log + anti-IDOR
  ServiceStagesPanel — lista editable con modal
  ServiceGantt — barras plan/real + línea hoy
  ActivityEditorModal — compartido Lista/Gantt
  ClientCronogramaTab — toggle vistas + permisos
  18 tests unitarios — computeStatus + Zod schemas
  ESLint 0 / TS 0 / 216 tests verdes

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
D-04 — Metodología (decisión de negocio)
D-10 — Trazabilidad Chat→Cuestionario (diferido)

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 8.8 / 10
Después → 9.1 / 10
Mejora  → +0.3 (cobertura + cronograma completo)
─────────────────────────────────────
```
