# App ResponSable

Sistema conversacional con IA y cadena de calidad por roles para consultoría en sostenibilidad.

## Descripcion

App web interna para el equipo de consultoría de ResponSable. Cuatro asistentes IA especializados (Aurora, Rebeca, Elena, Valeria) que operan como cadena de calidad escalonada sobre entregables de consultoría, empezando por Estudios de Doble Materialidad.

## Usuarios finales

- Internos: 8 consultores (MVP), expandible a ~20 (marketing, talento)
- Futuros: clientes corporativos (post-piloto)

## Roles IA (cadena de calidad)

| Rol | Nombre | Funcion |
|-----|--------|---------|
| Autor | Aurora | Construye borrador alineado a metodologia y estandares internos |
| Revisor | Rebeca | Detecta fallas, omisiones, riesgos. Checklist y rubrica |
| Elevador | Elena | Insights, trade-offs, narrativa, recomendaciones estrategicas |
| Validador | Valeria | Verifica Definition of Done, consistencia, evidencia, trazabilidad |

Flujo: secuencial sugerido (Aurora -> Rebeca -> Elena -> Valeria), no obligatorio.


## Contexto de auditoría
- Deuda técnica acumulada → ver DEUDA.md
- Últimos hallazgos críticos → ver AUDIT_LAST.md
- Si DEUDA.md no existe → crearlo al completar la primera auditoría

## Stack

- Stack base: ver `~/.claude/STACK_BASE.md`
- Diferencias con base: ver `STACK.md`

## Piloto

- Entregable: Estudio de Doble Materialidad
- Usuarios piloto: equipo de consultoria (8 personas)

## AI / Prompts
- Convenciones de prompt engineering y model selection: ver `~/.claude/STACK_BASE.md` (seccion AI / Prompt Engineering)

## MVP

1. Chat con 4 roles IA (Aurora/Rebeca/Elena/Valeria) con flujo secuencial sugerido

## Reglas de UX/a11y

- **Tokens brand**: definidos en `app/globals.css` `@theme inline` — `--color-brand-primary` teal, `--color-brand-primary-hover/dark/light`, `--color-brand-accent` ámbar, `--color-brand-berry` destructive, `--color-brand-ink` slate. NUNCA usar hex literales en componentes; siempre `bg-brand-primary`, `text-brand-berry`, etc.
- **Contraste:** body text ≥slate-700, helper/subtitle ≥slate-600. Nunca slate-300/400/500 para contenido (gate de migración cumplido al cierre de DRSP-4).
- **Focus ring:** `var(--color-brand-primary)` (teal ResponSable), nunca accent puro sobre blanco.
- **Touch targets:** botones e iconos ≥40px (los primitives `<Button size="md">` cumplen 40px, `lg` cumple 48px WCAG AAA).
- **Skeleton vs spinner (binario):** datos=`components/ui/Skeleton.tsx` (Card/List/Detail/Table/Dashboard), acción del usuario=`<Button loading>` inline.
- **Feedback async:** `useToast()` + `<ConfirmModal>` de `components/ui/`. NUNCA `window.confirm`, `setTimeout` banners, ni silent catches.
- **prefers-reduced-motion:** automático vía `globals.css` — neutraliza animaciones globalmente.
- **aria-live:** chat stream, SWR refetch, loading states con `role="log"` o `role="status"` `aria-live="polite"`.
- **Spanish convention:** ver `~/.claude/STACK_BASE.md` § "Convención de idioma".
- **Dev preview pattern:** `app/dev/<feature>-preview/page.tsx` con mocks + middleware bypass non-prod. Ejemplo canónico: `app/dev/primitives-preview/page.tsx`.
- **Tablas (8 principios STARTER_UX §7):** `min-w-full w-max` (no `w-full`), `overflow-x-auto` wrapper, sticky header, zebra, hover, `tabular-nums`, signal-over-noise + banner jerárquico §7.1.

## Codes de catálogo — humanización antes del LLM

Reglas para `lib/ai/roles.ts buildClientContext`:

- Toda categoría de catálogo (`sectors`, `client_sizes`, `frameworks`, `services`, `maturity_levels`, `material_topics`, etc.) se humaniza con `humanize(category, value)` antes de entrar al system prompt. El LLM ve "GRI Standards" no "gri", "Doble materialidad" no "doble_materialidad", "Gestionado" no "gestionado".
- El system prompt incluye instrucción dura: "NUNCA uses códigos internos del catálogo (doble_materialidad, gestionado, gri) en tu respuesta al consultor — son referencias técnicas internas, no se exponen al usuario".
- En UI: pasar el `value` interno solo para queries/filters; mostrar `humanize()` para render visible.
- Si agregas un campo nuevo de catálogo: agregar humanización en `buildClientContext` y test en `__tests__/lib/roles.test.ts`.

## Primitives canónicos — `components/ui/`

| Archivo | Propósito |
|---|---|
| `Button.tsx` | forwardRef, variants primary/secondary/ghost/destructive, size sm/md/lg, prop `loading` con spinner SVG |
| `Input.tsx` | `aria-invalid` + `aria-describedby` automáticos, error/helper inline |
| `Modal.tsx` | `role="dialog" aria-modal`, focus trap (Tab/Shift+Tab), restore focus, ESC cierra, click overlay cierra |
| `ConfirmModal.tsx` | wrapper Modal con tone primary/destructive y estado `busy` async (handleConfirm interno) |
| `Toast.tsx` + `useToast` | `aria-live="polite"`, auto-dismiss 4s, dismiss manual con ✕ |
| `SkipLink.tsx` | primer tabbable, visible al foco, target = `<main id="main-content">` |
| `Skeleton.tsx` | SkeletonCard/List/Detail/Table/Row/Dashboard |

`ConfirmDialog` (`components/ConfirmDialog.tsx`) es el wrapper anterior — sigue activo en CatalogsManager y PromptsManager por compat. Para código nuevo, usar `ConfirmModal` de `components/ui/`.

## Audit log de mutaciones admin

Toda mutación admin (POST/PATCH/DELETE en `/api/prompts/[key]`, `/api/users`, `/api/users/[email]`, `/api/catalogs`, `/api/catalogs/[id]`, `/api/clients/[id]`) llama a `logChange()` de `lib/audit-log.ts` con before/after snapshots. La tabla `audit_log` solo es legible por admins activos via RLS (migración `0020`).

Al agregar un nuevo endpoint admin con mutación: integrar `logChange({ actorEmail, entityType, entityId, action, before, after })`. El helper es fail-open (no rompe la mutación si la inserción falla).

## Cache breakpoints IA

`buildSystemBlocks` de `lib/ai/roles.ts` emite **2** cache breakpoints `ephemeral`:
1. `contextBlock` (preámbulo del cliente) — al cambiar de rol con mismo cliente, hit.
2. `roleBlock` (rol + reglas + navegación) — turnos subsecuentes con mismo (cliente, rol), hit.

Resultado: ~50% ahorro vs 1 solo breakpoint cuando el consultor cicla entre Aurora/Rebeca/Elena/Valeria sobre el mismo cliente. Si agregas un tercer breakpoint (max 4 permite Anthropic), considerar dónde corta mejor el caso de uso.
