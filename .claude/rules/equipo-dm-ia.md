---
paths:
  - "app/**/equipo/**"
  - "components/**/*Timeline*"
  - "app/api/clients/*/dm-*/**"
  - "components/doble-materialidad/**"
  - "lib/**/dm*"
---

# Módulo /equipo, GlobalTimeline y pipeline DM-IA

<!-- Mudado VERBATIM desde CLAUDE.md el 27-oct-2026 (carga sola al tocar los archivos de paths:). -->

## Módulo /equipo — arquitectura (may-2026)

4 vistas en `EquipoView`: Por consultor · Por proyecto · Timeline · Gantt.
- **ConsultorSwimlane eliminado** — valor absorbido por `GlobalTimeline` con toggle de color.
- Timeline + Gantt usan ancho completo (viewport). Consultor + Proyecto: `max-w-6xl`.

### GlobalTimeline — patrones canónicos

- **Color toggle** `ColorMode = 'estado' | 'proyecto'`:
  - `estado`: `STATUS_INLINE[a.status].{bg, fill, text}` — hex objects, no Tailwind classes
  - `proyecto`: `PROJECT_PALETTE` 12-color array + `clientColorMap` useMemo asigna hex por `client_id`
- **Progress fill**: `estimateProgress(a, now)` calcula 0-100% desde fechas planificadas vs now; `completed=100`, `pending=0`, in_progress proporcional. Se renderiza como `<div>` interno con `opacity: 0.55`.
- **`hexAlpha(hex, alpha)`**: util para fondos semitransparentes (rgba) sin Tailwind dinámico.
- **`STATUS_INLINE`**: objetos `{bg, fill, text}` hex en lugar de Tailwind classes. Necesario para estilos dinámicos inline.
- **Razón de no usar Tailwind**: los valores de color en Timeline dependen de datos (status/client_id) — no se pueden expresar como clases estáticas de Tailwind.

### DM-IA — pipeline 10 etapas (app-responsable, may-2026)

Solo **Benchmark competitivo** oculto via `SHOW_BENCHMARK_STAGES = false`
en `components/doble-materialidad/DoubleMaterialidadTab.tsx` (línea ~117).

**Flujo activo (10 etapas):**
Contexto → Referentes → Emp. referencia → IROs empresas → IROs cliente → Validación → Evaluación → Matriz → Resumen IA → Reporte

| # visible | ID | Visible | Status |
|-----------|-----|---------|--------|
| 1 | dm-sec-contexto | ✅ | Cuestionario |
| 2 | dm-sec-referentes | ✅ | Frameworks ESG |
| 3 | dm-sec-benchmark-empresas | ✅ | Empresas de referencia |
| — | dm-sec-benchmark | ❌ oculto | Benchmark competitivo (código activo) |
| 4 | dm-sec-benchmark-iros | ✅ | IROs de empresas |
| 5 | dm-sec-iros | ✅ | IROs del cliente |
| 6 | dm-sec-validacion | ✅ | Validación cliente |
| 7 | dm-sec-evaluacion | ✅ | Evaluación (placeholder) |
| 8 | dm-sec-matriz | ✅ | Matriz DM |
| 9 | dm-sec-resumen | ✅ | Resumen ejecutivo IA |
| 10 | dm-sec-reporte | ✅ | Reporte final |

**NIS/IBSO eliminado** del flujo — `dm-sec-nis` removido de pipeline.
**Validación** desbloquea desde `hasIros` (no desde `hasResumen` como antes).
**Evaluación** desbloquea cuando Validación done (contenido TBD, muestra placeholder).
**Re-activar Benchmark:** cambiar `SHOW_BENCHMARK_STAGES = true`. Código 100% presente.

Archivos del bloque benchmark (activos en repo, solo no renderizados):
- `components/doble-materialidad/`: BenchmarkSection, BenchmarkEmpresasSection, BenchmarkIrosSection,
  BenchmarkComparisonTable, BenchmarkCharts, BenchmarkVisuals, EmpresaCard,
  ManualAddEmpresaForm, ManualAddCompanyForm, benchmark-types.ts, benchmark-helpers.ts
- `app/api/clients/[id]/`: dm-benchmark/, dm-benchmark-empresas/, dm-benchmark-company-iros/
