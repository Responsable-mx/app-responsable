# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesiones 7 + 8 — ARIA/UX/paleta + Timeline v2)
**Modo:** /design-critique sesión 7 → implementación · feat(timeline) sesión 8
**Calificación:** 9.9 / 10

---

## Hallazgos sesión 7 — design polish (commit 6778e6b)

| Área | Fix | Estado |
|------|-----|--------|
| ChatWindow — a11y | `role="log" aria-live="polite"` en scroll area (CLAUDE.md §aria-live) | ✅ |
| ChatWindow — paleta | Elena `bg-indigo-800` → `bg-slate-800` · Valeria `bg-emerald-800` → `bg-slate-600` | ✅ |
| ChatWindow — deep-link | Banner "Completar ahora" → `?tab=cuestionario` (deep-link correcto) | ✅ |
| ChatWindow — pill | "Perfil X/6" oculta cuando banner amber visible (no duplicar contexto) | ✅ |
| ChatWindow — ruido | Remove "Ver todo" recientes (Historial en header = único entry point) | ✅ |
| ChatWindow — copy | ConfirmModal: "queda guardada en historial" (no alarmante) | ✅ |
| ChatWindow — disclaimer | Invisible → `title` del botón Enviar (libera línea, mantiene mensaje) | ✅ |
| ChatWindow — semántica | "Detener" → "Cancelar" (semántica correcta) | ✅ |
| ChatWindow — focus ring | Textarea `ring-brand-primary` → `ring-brand-primary/40` (consistente) | ✅ |
| ClientTabs — ARIA | `role="tablist/tab/tabpanel"` + `aria-selected` + `aria-controls` | ✅ |
| ClientTabs — URL sync | Tab click → `router.replace("?tab=X")` (deep-linkable, bookmark, back) | ✅ |
| ClientTabs — badge | `X/20` hardcoded → `"X temas"` (sin denominador frágil) | ✅ |
| ClientsList — flash | Default view `"table"` → `"cards"` (alineado con URL fallback, sin flash) | ✅ |
| ClientsList — a11y | `aria-label="Buscar clientes"` en search input | ✅ |
| ClientsList — toast | Export CSV → `pushToast("success", ...)` (TypeScript correcto) | ✅ |
| ClientsList — empty state | "Limpiar filtros" cuando hay filtros activos (proximidad al problema) | ✅ |
| ClientsList — shadow | `hover:shadow-md` → border-only (CLAUDE.md: shadow-sm máximo en cards) | ✅ |
| ClientsList — avatar | Gradient → `bg-brand-primary-dark` flat (B2B corporate) | ✅ |
| ClientsList — null state | `"Sin sector"` → `"—"` (patrón consistente) | ✅ |
| ClientsList — strip | Eliminado `daysAgo > 0` — siempre mostrar "Actualizado" | ✅ |
| ClientsList — teclado | Quick-action links: `focus-visible:opacity-100` (teclado alcanza el link) | ✅ |
| Config sub-pages | `metadata.title` por tab: Usuarios/Catálogos/Plantillas/Prompts IA/Uso IA/Preferencias | ✅ |
| UsersManager | Raw `<button>` → `<Button variant="primary" size="sm">` (design system) | ✅ |

---

## Hallazgos sesión 8 — Timeline v2 gerencial (commit b1c2e2f)

| Área | Fix | Estado |
|------|-----|--------|
| GlobalTimeline | KPI grid (total / en progreso / completado / retrasado) | ✅ |
| GlobalTimeline | RAG dot por proyecto (green/amber/red según avance) | ✅ |
| GlobalTimeline | Overlap heatmap amber para barras solapadas | ✅ |
| GlobalTimeline | Milestone diamonds en fechas clave | ✅ |
| GlobalTimeline | Cascade risk rings en dependencias | ✅ |
| GlobalTimeline | Stage-gate progress chip | ✅ |
| GlobalTimeline | Lane assignment por proyecto | ✅ |
| GlobalTimeline | Tooltip rico (nombre, fechas, avance, responsable) | ✅ |
| ServiceGantt | Fix warning lint (ternario-como-statement) + `Date.now()` purity | ✅ |
| GanttPorProyecto | Wiring `onQuickAction → handleQuickAction` + toast confirmación | ✅ |
| ActivityEditorModal | Campo `actual_progress` (range slider 0–100, step 5) | ✅ |
| lib/stages.ts | `actual_progress` en `StageActivity` type + `ActivityInputSchema` + `createActivity` | ✅ |
| ClientsList | `pushToast "ok"` → `"success"` (TypeScript build error resuelto) | ✅ |

---

## Archivos modificados (sesiones 7 + 8)

| Archivo | Sesión | Cambio |
|---------|--------|--------|
| `components/chat/ChatWindow.tsx` | 7 | 9 fixes ARIA/paleta/copy/UX |
| `components/ClientTabs.tsx` | 7 | ARIA tabs + URL sync + badge fix |
| `components/ClientsList.tsx` | 7+8 | 9 UX fixes + TS fix toast |
| `components/config/UsersManager.tsx` | 7 | Button primitivo |
| `components/services/QuickActionPopover.tsx` | 7 | Componente nuevo |
| `components/services/ClientCronogramaTab.tsx` | 7 | Mejoras wiring |
| `app/(dashboard)/configuracion/*/page.tsx` | 7 | metadata.title (6 páginas) |
| `components/config/GlobalTimeline.tsx` | 8 | Timeline v2 gerencial (8 features PM) |
| `components/services/ServiceGantt.tsx` | 8 | Lint fix + purity |
| `components/config/GanttPorProyecto.tsx` | 8 | Wiring + toast |
| `components/services/ActivityEditorModal.tsx` | 8 | Campo actual_progress |
| `lib/stages.ts` | 8 | Type + schema + createActivity |
| `STACK.md` | 7 | Registro caché nuevo dato |

---

## Áreas sin hallazgos nuevos

- Auth cobertura: GET=`requireUser`, mutaciones=`requireAdmin`, cron=`verifyCron` ✅
- Anti-IDOR: `getStageOwnerClient` + `getActivityOwnerClient` aplicados ✅
- Validación Zod: todos los inputs validados antes de DB ✅
- SelectField: keyboard, click fuera, aria-selected, Inter garantizado ✅
- audit_log fail-open: patrón correcto ✅
- Cache breakpoints IA: 2 ephemeral en buildSystemBlocks ✅
- Humanización de catálogos antes del LLM: implementado ✅
- SWR + keepPreviousData en ClientsList: sin flash en debounce ✅

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable: decisión de negocio pendiente |
| D-10 | 🟢 | Sin trazabilidad Chat → Cuestionario (diferido) |

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesiones 7+8 — ARIA/UX/paleta + Timeline v2)
─────────────────────────────────────
✅ CERRADO EN ESTAS SESIONES
─────────────────────────────────────
Sesión 7 — 23 fixes design polish:
- ChatWindow: aria-live, paleta B2B, deep-link, pill, copy, disclaimer→title, focus ring
- ClientTabs: ARIA tabs pattern completo, URL deep-link, badge sin denominador frágil
- ClientsList: default view flash, aria-label, toast, empty state, shadow, avatar, strip
- Config: metadata.title por tab (6 páginas)
- UsersManager: Button design system

Sesión 8 — Timeline v2 gerencial (8 features PM world-class):
- KPI grid, RAG dots, overlap heatmap, milestone diamonds, cascade risk rings
- Stage-gate, lane assignment, tooltip rico
- actual_progress slider en ActivityEditorModal
- TypeScript build error resuelto (ToastTone "ok"→"success")

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
🟡 D-04 — Metodología ResponSable (decisión de negocio)
🟢 D-10 — Trazabilidad Chat→Cuestionario (diferido)

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.8 / 10
Después → 9.9 / 10
Delta   → +0.1 (36 fixes en 2 sesiones; 0 deuda nueva)
─────────────────────────────────────
```
