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

## Design system corporativo B2B — decisiones (may-2026)

Aprobado en sesión de diseño. Clientes son empresas corporativas → UX nivel McKinsey/Salesforce/SAP Fiori.

- **Paleta**: `slate-*` (fría, técnica). Nunca `stone-*` en UI de clientes.
- **Radio**: `rounded` (4px) para cards y tabs. `rounded-sm` para badges/chips. Nunca `rounded-xl` en contenedores de datos.
- **Iconos**: SVG monocromo inline. Cero emoji en componentes de UI (excepción: flujo textual del LLM).
- **Labels**: `uppercase tracking-widest text-[10px] font-bold text-slate-400` — patrón SAP Fiori.
- **Progress bars**: `h-1` plano, sin `rounded-*` — estilo Salesforce.
- **Fichas de sección**: left border accent de color (4px) como indicador de status, no fondo pastel.
- **Tabs**: fondo `slate-50`, tab activo `bg-white + border-brand-primary`, labels uppercase.
- **Badges en tabs**: progreso visible inline `[100%]` `[5/5]` `[20/20]`.
- **Shadow**: `shadow-sm` en cards (no `shadow-md`/`shadow-lg`).

## Matriz de Doble Materialidad — patrón BCG/McKinsey (Fase 3 pendiente)

Diseño canónico (recuperar SVG desde git history del mockup eliminado `app/dev/app-preview/AppShell.tsx`):

- **20 temas** posicionados en plano X/Y (materialidad financiera × impacto)
- **Shape encoding**: ● rose=Doble material, ◆ amber=Material por impacto, ■ teal=Material financiero, ▲ slate=En seguimiento — accesible para daltónicos
- **Narrative chip**: síntesis automática (N temas doble material, riesgo principal)
- **Filtro por cuadrante**: pills que diman dots no activos (15% opacity)
- **Índice numerado**: panel derecho con símbolo + nombre truncado
- **Popover al click**: nombre, cuadrante, sección → CTA "Ver en Cuestionario" / "Iniciar Chat IA"
- **Ejes 0–10** con grid lines, dashed midpoint dividers. Sin fondos pastel.
- **Esc** cierra popover. Touch targets 40×40px.

Schema pendiente: tabla `materiality_topics(client_id, topic_key, label, x_pos, y_pos, color, size)` + endpoint `/api/clients/[id]/materiality`.

## Metodología ResponSable — PENDIENTE

El equipo aún no ha definido los pasos reales de la metodología. **No inventar** placeholders. Cuando se defina, agregar como 5to KPI card en `ClientTabs`.

## Chat IA — mejores prácticas (implementadas en ChatWindow, may-2026)

Funciones activas en `components/chat/ChatWindow.tsx`:
- **Copiar respuesta**: `copyMessage()` en cada mensaje IA (clipboard API) — botón ✕ en toolbar
- **Calificar**: thumbs up/down por mensaje (`rateMessage()`), persiste en sesión local y `chat_sessions`
- **Exportar conversación**: `exportMd()` → descarga `.md` con timestamp
- **Retry/Regenerar**: `retryLast()` — reenvía último mensaje del usuario con el mismo rol

## Consolidación mayo-2026 — eliminación del mockup `/dev/app-preview`

El mockup `app/dev/app-preview/AppShell.tsx` fue eliminado. La app real en `app.responsable.net` consume los endpoints reales:
- `/chat` → `ChatWindow` con streaming SSE de `/api/chat`
- `/clientes` → `ClientsList` con datos de `/api/clients`
- `/clientes/[id]` → `ClientTabs` con 5 tabs: Contexto + Servicios + Cuestionario (wizard AI-fill) + Materialidad (lista con X/Y) + Equipo (seniority)

Diseño corporate aplicado a `ClientTabs` (KPI cards uppercase + tabs con badges) y `ClientsList` (tabla con headers tracking-widest). Login obligatorio en raíz.

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

### Fuente en modales — regla global

`globals.css` ya aplica `font-family: inherit` a todos los form controls (`input`, `select`, `textarea`, `button`). Esto garantiza que Inter se use automáticamente sin importar dónde estén los controles.

**Al crear un nuevo modal con `<textarea>` o `<select>`:** agregar clase `font-sans` explícitamente aunque sea redundante — hace el intent visible y protege contra resets de CSS de terceros:

```tsx
<textarea className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
<select className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
```

Patrón tomado de `TemplatesManager.tsx` y `TemplateActions.tsx` como referencia canónica.

## Audit log de mutaciones admin

Toda mutación admin (POST/PATCH/DELETE en `/api/prompts/[key]`, `/api/users`, `/api/users/[email]`, `/api/catalogs`, `/api/catalogs/[id]`, `/api/clients/[id]`, `/api/clients/[id]/consultors`, `/api/clients/[id]/consultors/[email]`) llama a `logChange()` de `lib/audit-log.ts` con before/after snapshots. La tabla `audit_log` solo es legible por admins activos via RLS (migración `0020`).

Al agregar un nuevo endpoint admin con mutación: integrar `logChange({ actorEmail, entityType, entityId, action, before, after })`. El helper es fail-open (no rompe la mutación si la inserción falla).

## Seniority + equipo por cliente (may-2026)

**Arquitectura dos niveles** — no duplicar lógica en dos tablas:
- `authorized_users.seniority_level` → nivel global del consultor (default)
- `client_consultors.seniority_level` → override por proyecto (NULL = "usa global")

**Tab Equipo** en `ClientTabs`: renderiza `<TeamTab clientId isAdmin>`. El prop `isAdmin` viene del server component `[id]/page.tsx` vía `requireAdmin()` en `Promise.all` paralelo — el server component decide autorización, el client component solo recibe boolean.

**CatalogsManager auto-incluye** cualquier categoría nueva agregada a `lib/catalogs/seeds.ts` sin cambios de código en el manager.

**Auth pattern para sub-recursos de cliente:**
- Lectura → `requireUser` (todos los consultores activos)
- Mutaciones → `requireAdmin` + `logChange()`

## Cache breakpoints IA

`buildSystemBlocks` de `lib/ai/roles.ts` emite **2** cache breakpoints `ephemeral`:
1. `contextBlock` (preámbulo del cliente) — al cambiar de rol con mismo cliente, hit.
2. `roleBlock` (rol + reglas + navegación) — turnos subsecuentes con mismo (cliente, rol), hit.

Resultado: ~50% ahorro vs 1 solo breakpoint cuando el consultor cicla entre Aurora/Rebeca/Elena/Valeria sobre el mismo cliente. Si agregas un tercer breakpoint (max 4 permite Anthropic), considerar dónde corta mejor el caso de uso.
