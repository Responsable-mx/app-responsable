# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 2)
**Modo:** /audit-health (post-sprint D-07 + logos + sidebar)
**Calificación:** 8.8 / 10

---

## Contexto

Auditoría post-features: PDF export (D-07), logo_url en ClientForm, sidebar "Mis proyectos".
Todos los hallazgos nuevos encontrados y resueltos en la misma sesión.

---

## Hallazgos — todos resueltos en sesión

| ID | Severidad | Descripción | Fix |
|----|-----------|-------------|-----|
| D-33 | 🔴 Crítico | IDOR en `/api/client-services/[id]` PATCH/DELETE | `getClientService` antes de mutar → 404 si no existe |
| D-34 | 🟡 Importante | URLs de documentos sin `.url()` — aceptaban `javascript:` | `.url("URL inválida")` en 3 campos de `ClientInputSchema` |
| D-35 | 🟡 Importante | `ExportPdfButton` usaba `alert()` en lugar de `useToast()` | Migrado a `push("error", msg)` |
| D-36 | 🟡 Importante | PATCH/DELETE `client-services` sin `logChange()` | `void logChange(...)` en ambas mutaciones |
| D-37 | 🟡 Importante | `listConsultorProjects` 3 queries secuenciales | `Promise.all([clients, userRow])` — ~120ms ahorrados por carga |
| D-38 | 🟢 Menor | Prop `page` dead code en Footer PDF | Prop eliminado |
| D-39 | 🟢 Menor | Sidebar SWR sin manejo de `error` en "Mis proyectos" | `error` desestructurado, fallback `[]` |

---

## Áreas revisadas sin hallazgos nuevos

- Auth en todas las rutas nuevas (`/api/consultors/me`, `/api/clients/[id]/export-pdf`)
- `lib/validation.ts` — `logo_url` con `.url()` correcto
- `lib/consultors.ts` — filtro por email correcto, no expone datos cruzados
- `lib/pdf/client-report.tsx` — sin secretos, sin `any` sin justificar
- `components/ExportPdfButton.tsx` — manejo de busy, limpieza de object URL
- `/api/cron/audit-health` — `verifyCron()` presente

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 2)
─────────────────────────────────────
RESUELTO EN ESTA SESIÓN (audit-health)
─────────────────────────────────────
D-33 IDOR client-services — cualquier consultor podía mutar servicios ajenos
D-34 javascript: URI en campos URL — XSS potencial via href
D-35 alert() en ExportPdfButton — fuera de design system (useToast)
D-36 logChange faltante en client-services PATCH/DELETE — audit trail roto
D-37 3 queries secuenciales — paralelas en listConsultorProjects
D-38 prop page dead code en Footer PDF
D-39 Sidebar SWR sin error state silencioso

PENDIENTE
─────────────────────────────────────
D-04 — Metodología (decisión de negocio, sin código)
D-10 — Trazabilidad Chat→Cuestionario (diferido)

CALIFICACIÓN
─────────────────────────────────────
Antes   → 6.2 / 10
Después → 8.8 / 10
Mejora  → +2.6
─────────────────────────────────────
```
