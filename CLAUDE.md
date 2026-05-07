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

## Chat IA — layout bilateral (may-2026)

Implementado en `components/chat/ChatWindow.tsx`. Patrón canónico — no revertir:

- **Mensajes consultor**: `flex justify-end` + `bg-slate-100` + sin avatar. Label "Consultor" alineado derecha.
- **Mensajes IA**: `flex items-start gap-3` + avatar circular (`rounded-full`) + bubble `bg-white border border-slate-200 border-l-4` con color semántico por rol.
- **Borde izquierdo por rol**: Aurora=`border-l-brand-primary-dark`, Rebeca=`border-l-slate-500`, Elena=`border-l-amber-600`, Valeria=`border-l-emerald-700`. Definido en `ROLES[].borderColor`.
- **Tipografía IA**: `prose-h1:text-sm prose-h2:text-sm prose-h3:text-xs` — headings nunca dominan el chat.
- **Acciones** (thumbs, copy, retry): solo en mensajes IA, dentro del bubble.

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

### Fuente en form controls — reglas globales

`globals.css` aplica `font-family: inherit` a `input`, `select`, `textarea`, `button` — garantiza Inter en el control colapsado.

**Limitación conocida de browsers:** el popup nativo de `<select>` en Windows/Chrome/Edge usa el font del SO (Segoe UI) cuando está abierto. CSS no puede sobrescribir esto.

**Regla:** nunca usar `<select>` nativo donde el dropdown sea visible al usuario. Usar `<SelectField>` de `components/ui/SelectField.tsx` — custom listbox con Inter garantizado.

```tsx
// ✅ Correcto
import { SelectField } from "@/components/ui/SelectField";
<SelectField value={val} onChange={setVal} options={[{ value: "x", label: "X" }]} placeholder="Todos" />

// ❌ Evitar en dropdowns visibles
<select className="font-sans ...">...</select>
```

**Al crear un modal con `<textarea>`:** agregar `font-sans` explícitamente aunque `globals.css` ya lo cubre — hace el intent visible:
```tsx
<textarea className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
```

### Checklist obligatorio al crear cualquier modal nuevo

Antes de cerrar un nuevo componente `<Modal>`, verificar:

| Control | ✅ Correcto | ❌ Prohibido |
|---------|------------|-------------|
| Dropdown | `<SelectField>` de `components/ui/SelectField.tsx` | `<select>` nativo |
| Texto largo | `<textarea className="font-sans ...">` | `<textarea>` sin `font-sans` |
| Input fecha/número | `<Input>` de `components/ui/Input.tsx` | `<input>` raw |
| Confirmación destructiva | `<ConfirmModal>` de `components/ui/` | `window.confirm` |
| Notificación post-acción | `useToast().push(...)` | `alert()` o banner con `setTimeout` |

**Regla de oro:** si el modal tiene un `<select>` nativo → reemplazar con `<SelectField>` antes del commit. Windows/Chrome no puede sobrescribir la fuente del SO en el dropdown abierto.

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

## Subsistema de documentos por cliente (Sprint B, may-2026)

Documentos persistentes asociados a un cliente, convertidos a Markdown para
contexto IA. Reemplazan el doc-fill solo-texto del MVP.

### Modelo de datos

- `clients.sustainability_report_url` / `financial_report_url` — columnas de
  metadata. La IA puede investigar y poblar estos URLs.
- `client_documents` (mig 0041): `kind` ∈ {`general`, `sustainability_report`,
  `financial_report`} · `parse_status` ∈ {`pending`, `ok`, `failed`} ·
  `markdown_content` (nullable hasta parse) · `storage_path` único en bucket
  privado `client-documents`. RLS permite lectura/escritura a authenticated;
  DELETE solo via service role (admin via API).
- Cap 25MB por archivo (DB CHECK + bucket file_size_limit + API check
  `MAX_BYTES`). MIME whitelist en bucket + en endpoint POST.

### Parsers (`lib/documents/parsers.ts`)

- PDF: `pdf-parse` v1.1.1 (no actualizar a v2 — API rota)
- DOCX: `mammoth.convertToHtml` + `htmlToMarkdownLite` custom (mammoth no tiene
  markdown nativo aún; cambiar cuando exista)
- XLSX: `exceljs` → markdown table por hoja (xlsx tiene CVE sin fix, NO usar)
- PPTX: `JSZip` extrae `<a:t>` de `ppt/slides/slideN.xml`
- TXT/MD: passthrough
- `truncateMarkdown(MAX=200_000 chars)` para tope global.

### Pipeline ingest desde URL externa

`POST /api/clients/[id]/ingest-report` body `{kind, url}`:

1. SSRF guard (`lib/documents/ssrf.ts`): bloquea localhost, RFC1918, link-local,
   IPv6 ULA. **Cualquier endpoint que haga `fetch()` a URL externa debe usar
   `isPublicHttpUrl` antes**.
2. Fetch con `User-Agent: ResponSable-DocIngest/1.0` + timeout 60s + redirect
   follow.
3. Content-Type whitelist (PDF/DOCX/XLSX/PPTX/TXT/MD/HTML). HTML strip → texto.
4. Tope 25MB (Content-Length + buffer.length post-download).
5. Parse → `client_documents` con `kind` + `source_url`. Actualiza columna URL
   en `clients`.

### Uso en flujo IA (`ai-fill`)

- Carga `listDocumentsByClient(clientId)` y filtra `kind !== general` con
  `parse_status === ok`.
- Inyecta hasta 30k chars/doc como `INFORMES PÚBLICOS DEL CLIENTE — FUENTE
  PRIMARIA` antes de instrucción `web_search`.
- LLM debe citar `source_url` real del informe en `sources.url`. Solo si dato
  no está en informes, complementa con web_search.

### Cron refresh

- `/api/cron/refresh-reports` — semestral (1ro junio + 1ro diciembre 11:00 UTC).
  Solo lista clientes con `sustainability_report` o `financial_report` >180d.
  No re-research automático (costo IA + riesgo URL equivocada). Refresh es
  manual desde botón "Buscar de nuevo" del `ReportIaButton`.

### UI canónica

- Tab "Documentos" en `ClientTabs` (7ma tab) — `components/documents/DocumentsTab.tsx`
- Modal "Importar" en cuestionario tabbed (Pegar / Subir / Mis docs) —
  `components/questionnaire/ImportModal.tsx`
- Botón IA en ClientForm — `components/clients/ReportIaButton.tsx` con timer
  visible 30-90s + cancelable via `AbortController`.

### Reglas para ampliar

- Nuevo `kind` → agregar al CHECK de migración + `KIND_LABEL` + ai-fill mapping
- Nuevo formato → agregar a `detectFileType`/`MIME_TO_TYPE` + parser + bucket
  `allowed_mime_types`
- Nuevo endpoint que descarga URL externa → SIEMPRE pasar por `isPublicHttpUrl`

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

### ClientTabs — lazy loading (may-2026)

6 tabs pesados usan `next/dynamic` con fallback `<Skeleton>`:
- `QuestionnaireTab`, `MaterialityTab`, `ChatWindow`, `ClientCronogramaTab`, `TeamTab`, `DocumentsTab`
- Solo `ClientResumen` es eager (tab por defecto).
- Patrón canónico: `components/ClientTabs.tsx`.

## Deploy — app-responsable (may-2026)

**Push a `main` → auto-deploy automático** a `https://app.responsable.net`.  
GitHub `Responsable-mx/app-responsable` conectado a Vercel (integración GitHub App, may-2026).  
`vercel --prod` ya no es necesario para este proyecto.

## Cache breakpoints IA

`buildSystemBlocks` de `lib/ai/roles.ts` emite **2** cache breakpoints `ephemeral`:
1. `contextBlock` (preámbulo del cliente) — al cambiar de rol con mismo cliente, hit.
2. `roleBlock` (rol + reglas + navegación) — turnos subsecuentes con mismo (cliente, rol), hit.

Resultado: ~50% ahorro vs 1 solo breakpoint cuando el consultor cicla entre Aurora/Rebeca/Elena/Valeria sobre el mismo cliente. Si agregas un tercer breakpoint (max 4 permite Anthropic), considerar dónde corta mejor el caso de uso.
