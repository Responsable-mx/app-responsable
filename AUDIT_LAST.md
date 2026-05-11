# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-10 (sesión 28 — D-04 N/A + D-158 SDK + D-150 5/6 secciones DM Tab + D-163/164 bugs latentes)
**Calificación global:** 9.7 / 10 (vs 9.6 sesión 27)

---

## Aplicado sesión 28 (cleanup + refactor monolitos)

### D-04 — Metodología ResponSable: NO contabilizar
Por instrucción del usuario, eliminado del scoring de deuda. Sigue presente en código (5ta KPI card pendiente) pero NO afecta scores hasta que el equipo metodología defina los pasos. Ticket de feature, no deuda técnica.

### D-158 — Anthropic SDK 0.79.0 → 0.95.1 ✅
- Bump aplicado sin breaking changes
- TS 0, ESLint 0/0, 318/318 tests verde
- **Bonus**: 8 `cache_control: { type: "ephemeral" } as any` eliminados en 8 routes IA. SDK 0.95 expone `CacheControlEphemeral` como type estable. `Batch result` discriminated union (`type: 'succeeded' | 'errored'`). Usage cache fields estables.
- ESLint `--fix` removió 7-9 disable directives huérfanos automáticamente.

### D-150 — DoubleMaterialidadTab.tsx refactor 5/6 secciones (PARCIAL)
**Reducción**: 2988L → 1911L (-36%). 5 archivos extraídos:

| Archivo | LOC | Contenido |
|---------|-----|-----------|
| `HorizontesConfig.tsx` | 121 | Config horizontes temporales (corto/mediano/largo year) + DmHorizons type |
| `NisSection.tsx` | 244 | Etapa 4 NIS/IBSO + ESTADO_LABEL/COLOR + CALIDAD_LABEL + CATEGORIA_LABEL/COLOR + NisItem type |
| `ContextoSection.tsx` | 103 | Etapa 1 KPI cards (Sector/Tamaño/Marcos) + progress bar + warning banner |
| `ReporteSection.tsx` | 217 | Etapa 5 generar/descargar/regenerar PDF + LatestReport type |
| `IroSection.tsx` | 411 | Etapa 3 IROs + ScorePicker + prioridad helper + SCORE_DIM*_LABEL/TOOLTIP + TIPO_BADGE/CADENA_LABEL |
| `ExpandableCell.tsx` | 26 | Celda truncada compartida (usada en IroSection + BenchmarkSection) |
| `catalog-lookup.ts` | 15 | `catalogLabel(category, value)` desde CATALOG_SEEDS |

**Pendiente**: `BenchmarkSection.tsx` 775L sigue inline (refactor con state SWR complejo, requiere smoke test cliente Nuvoil/Altamira).

### D-163 — AuditEntityType faltaba `questionnaire_snapshot` ✅
TS error preexistente detectado al limpiar cache post SDK bump. `lib/audit-log.ts` actualizado.

### D-164 — AiBulkBanner consumer desactualizado ✅
AiBulkBanner refactorizó props (`onFillScope` con scope union) pero QuestionnaireTab seguía con props viejas (`someStepHasResponses`, `onFillAll`). `useMemo` calcula counts por scope. `handleFillScope(scope)` reemplaza handler viejo.

---

## Pendientes activos post-sesión 28

| ID | Sev | Descripción | Próximo paso |
|----|-----|-------------|--------------|
| D-150 part | 🟡 | BenchmarkSection 775L sigue inline | Sprint dedicado: branch + smoke test propose/compare/add_manual/remove con cliente real |
| D-153 | 🟢 | DocumentsTab 82KB + ServiceGantt 55KB | Refactor con D-150 BenchmarkSection mismo sprint |
| D-157 | 🟢 | ClientForm 686L + ClientsList 618L | Misma decisión |
| D-161 | 🟢 | DocumentsTab creció 82KB | Subset D-153 |
| D-147 | 🟢 | Cache in-memory extract-profile | Aceptado MVP definitivo |

---

## Validación post-fixes sesión 28

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | ✅ 0 errores |
| `npx eslint .` | ✅ exit 0 — 0 errors, 0 warnings |
| `npx vitest run` | ✅ 318/318 tests verde |
| `npm audit` | 2 moderate preexistentes (de 3 a 2 — SDK bump bajó 1 vuln) |

## Score sesión 28

| Dimensión | Post-27 | Post-28 |
|-----------|---------|---------|
| Seguridad | 9.8 | 9.8 |
| Confiabilidad | 9.8 | 9.8 |
| UX | 9.2 | 9.2 |
| Arquitectura | 9.7 | 9.8 (D-150 5 secciones extraídas, mejor separación responsabilidades) |
| Rendimiento | 9.2 | 9.2 |
| Calidad de código | 9.8 | 9.8 (cache_control as any eliminados, types estables) |
| Observabilidad | 9.6 | 9.6 |
| Deuda técnica | 9.5 | 9.7 (D-04 N/A removido + D-158 + D-163/164 cerrados) |
| **Global** | **9.6** | **9.7** |

---

## Auditoría anterior: 2026-05-10 (sesión 27)
**Score post-fix:** 9.6/10 — D-151/159/160/162/147 cerrados.
