# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 5 — sprint plantillas + equipo global)
**Modo:** /audit completo (+ /audit-ia /audit-mvp /audit-seg /audit-pyme /audit-skill /audit-health /audit-refactor /simplify)
**Calificación:** 9.3 / 10

---

## Hallazgos y cierre esta sesión

| ID | Sev | Descripción | Estado |
|----|-----|-------------|--------|
| D-54 | 🟢 | Native `<select>` en 7 lugares — viola regla SelectField | ✅ Migrados a SelectField |
| D-55 | 🟡 | `team/occupancy` full-scan sin filtro temporal | ✅ Filtro 1-año en query |
| D-56 | 🟢 | PATCH stage-template audit log sin `before` | ✅ `getTemplate` previo + before en logChange |
| D-57 | 🟢 | `getActivityOwnerClient` tipo assertion doble-cast 3 líneas | ✅ Colapsado a `as any` |

## Cerrado en esta sesión

| Fix | Descripción |
|-----|-------------|
| `SelectField.tsx` | Nuevo componente + prop `id` para asociación `htmlFor` |
| `EquipoFilters.tsx` | 3 native selects → SelectField (sesión anterior) |
| `ActivityEditorModal.tsx` | Select asignado → SelectField |
| `TemplatesManager.tsx` | 2 selects servicio → SelectField |
| `TeamTab.tsx` | 3 selects (consultor + seniority x2) → SelectField |
| `ChatWindow.tsx` | Client picker select → SelectField |
| `QuestionnaireTab.tsx` | Field type "select" → SelectField |
| `CLAUDE.md` | Regla SelectField documentada + limitación browser |
| `stage-templates/[id]/route.ts` | PATCH: before snapshot en audit log |
| `lib/stages.ts` | getActivityOwnerClient tipo assertion simplificado |
| `team/occupancy/route.ts` | Filtro temporal 1 año en actividades |

---

## Áreas sin hallazgos nuevos

- Auth cobertura: GET=`requireUser`, mutaciones=`requireAdmin`, cron=`verifyCron` — consistente ✅
- Anti-IDOR: `getStageOwnerClient` + `getActivityOwnerClient` aplicados ✅
- Validación Zod: todos los inputs validados antes de DB ✅
- Dev mode isolation: `isDevMode()` en stores in-memory — sin contaminación en prod ✅
- Cron delayed-activities: killswitch, filtro usuarios activos, `escapeHtml` en HTML ✅
- SelectField nuevo: keyboard, click fuera, aria-selected, Inter garantizado ✅
- PATCH handler stage-templates: existe completo (GET/PATCH/DELETE) ✅
- applyTemplate: order_index correcto, offsets calculados bien ✅
- computeStatus: función pura, lógica correcta ✅
- projects/overview queries: 4 en paralelo con Promise.all ✅
- audit_log fail-open: patrón correcto ✅

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable: decisión de negocio pendiente |
| D-10 | 🟢 | Sin trazabilidad Chat → Cuestionario (diferido) |

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 5 — deuda limpiada)
─────────────────────────────────────
✅ CERRADO EN ESTA SESIÓN
─────────────────────────────────────
D-54 — 7 native <select> → SelectField (font Inter garantizada)
D-55 — team/occupancy filtro 1-año (no más acumulación indefinida)
D-56 — PATCH stage-template before snapshot en audit log
D-57 — getActivityOwnerClient tipo assertion simplificado
+ SelectField.tsx prop id (a11y htmlFor)
+ CLAUDE.md regla SelectField documentada

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
🟡 D-04 — Metodología ResponSable (decisión de negocio)
🟢 D-10 — Trazabilidad Chat→Cuestionario (diferido)

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.4 / 10
Después → 9.6 / 10
Delta   → +0.2 (D-54–57 cerrados; solo 2 items activos ambos no-código)
─────────────────────────────────────
```
