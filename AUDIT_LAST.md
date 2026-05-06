# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 6 — design polish integral)
**Modo:** /design-critique (16 ejes) → implementación total (3 batches)
**Calificación:** 9.8 / 10

---

## Hallazgos y cierre esta sesión

| ID | Eje | Descripción | Estado |
|----|-----|-------------|--------|
| — | Semántica | `Metric` sin `hintTone` — hint text siempre slate-600 sin señal de estado | ✅ Prop `hintTone` ok/warn/red → emerald/amber/red |
| — | Consistencia | ConfigTabs en orden alfabético — no flujo de trabajo admin | ✅ Reordenado: Usuarios → Catálogos → Plantillas → Prompts IA → Uso IA → Preferencias |
| — | Iconos | Tamaño icono ConfigTabs `w-4 h-4` (16px) — menor al estándar 18px del design system | ✅ `w-[18px] h-[18px]` |
| — | Duplicidad | Botón "Exportar" duplicado en header Y footer de ChatWindow | ✅ Removido del header; solo en footer |
| — | Literales | Flechas `→` literales en 3 CTAs de ChatWindow — carácter especial raw en JSX | ✅ Eliminadas ("Ver ficha →" → "Ver ficha", etc.) |
| — | a11y | Textarea chat sin `aria-label` — screen reader no identifica campo | ✅ `aria-label={`Escribe a ${currentRole.name}`}` |
| — | Touch targets | Thumbs/copy/retry con `p-1` — área <40px viola WCAG | ✅ `min-w-[40px] min-h-[40px] flex items-center justify-center` |
| — | Progressive disclosure | HelpMenu desaparece en sidebar colapsado — pérdida de feature | ✅ `iconOnly` prop + siempre visible en sidebar colapsado |
| — | a11y Modal | "Guardar vista" usaba modal custom `fixed inset-0` sin focus trap | ✅ Reemplazado con primitivo `<Modal>` (Tab/ESC/aria-modal) |
| — | Dropdown | `ClientsList` sector filter `<select>` nativo — violaba regla SelectField | ✅ Migrado a `<SelectField>` |
| — | Ruido visual | Clientes/[id] header mostraba `created_by` — dato interno sin valor para consultor | ✅ Removido |
| — | Separadores | Clientes/[id] pipe `|` entre metadatos — UX informal | ✅ Reemplazado por `·` |
| — | Loading | Badge de cuestionario mostraba "0/0" durante carga — confundía | ✅ `null` durante carga → sin badge visible |
| — | Tailwind | `style={{ height: "min(75vh, 720px)" }}` inline en ClientTabs — inconsistente | ✅ `className="h-[min(75vh,720px)]"` |
| — | Duplicidad | Redundant `<p>Clientes</p>` label encima del `<h1>` en lista de clientes | ✅ Eliminada |
| — | Layout | EquipoView: toggle y descripción intro en misma fila — conflicto visual | ✅ Toggle right-aligned arriba, intro párrafo abajo con `-mt-2` |
| — | Estilo | Preferencias botón "Reiniciar tour" con `bg-brand-primary-hover` — tono incorrecto para acción secundaria | ✅ Secondary style `bg-white border border-slate-300` |

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/(dashboard)/configuracion/uso-ia/page.tsx` | Prop `hintTone` en `Metric` con color semántico |
| `components/config/ConfigTabs.tsx` | Orden workflow + icon size 18px |
| `components/chat/ChatWindow.tsx` | Remove export dup, fix arrows, aria-label, touch targets |
| `components/HelpMenu.tsx` | Prop `iconOnly` para sidebar colapsado |
| `components/Sidebar.tsx` | HelpMenu siempre visible (iconOnly cuando collapsed) |
| `components/ClientsList.tsx` | SelectField + Modal primitivo en "Guardar vista" |
| `app/(dashboard)/clientes/[id]/page.tsx` | Remove created_by, pipe→dot |
| `components/ClientTabs.tsx` | Badge null en carga, inline style→Tailwind |
| `app/(dashboard)/clientes/page.tsx` | Remove redundant label |
| `components/config/EquipoView.tsx` | Separar toggle e intro en dos filas |
| `components/config/PreferencesPanel.tsx` | Tour button secondary style |

---

## Áreas sin hallazgos nuevos

- Auth cobertura: GET=`requireUser`, mutaciones=`requireAdmin`, cron=`verifyCron` — consistente ✅
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

Sin items nuevos — la sesión fue 100% UX/a11y polish sobre código existente.

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 6 — design polish 16 ejes)
─────────────────────────────────────
✅ CERRADO EN ESTA SESIÓN
─────────────────────────────────────
17 findings UX/a11y/consistencia en 3 batches:
- Metric hintTone semántico (ok/warn/red)
- ConfigTabs orden workflow + icon size
- ChatWindow export no-dup, arrows fix, aria-label, touch targets ≥40px
- HelpMenu iconOnly (sidebar collapsed)
- ClientsList SelectField + Modal primitivo
- Clientes/[id] ruido header removido
- ClientTabs badge null + Tailwind arbitrary
- EquipoView layout toggle/intro
- PreferencesPanel secondary button style

─────────────────────────────────────
⏳ PENDIENTE (por prioridad)
─────────────────────────────────────
🟡 D-04 — Metodología ResponSable (decisión de negocio)
🟢 D-10 — Trazabilidad Chat→Cuestionario (diferido)

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 9.6 / 10
Después → 9.8 / 10
Delta   → +0.2 (17 fixes UX/a11y/consistencia; 0 deuda nueva)
─────────────────────────────────────
```
