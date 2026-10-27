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

## Mockups `/dev/*` → `.claude/rules/dev-mockups.md` (carga sola al tocar `app/dev/`)

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

## Subsistema de documentos por cliente + retrieval semántico (BM25, Voyage) → `.claude/rules/documentos.md` (carga sola al tocar `lib/documents/`, `components/documents/`, rutas de documentos, crons o `ai-fill`)

## Módulo /equipo, GlobalTimeline y DM-IA (pipeline 10 etapas) → `.claude/rules/equipo-dm-ia.md` (carga sola al tocar `equipo`, timeline, rutas `dm-*` o `components/doble-materialidad/`)

## ClientTabs — lazy loading + header fusionado → `.claude/rules/client-tabs.md` (carga sola al tocar `components/ClientTabs.tsx` o `app/(dashboard)/clientes/`)

## Patrón canónico — Texto expandible "Ver más / Ver menos" (may-2026)

**Nunca usar conteo de caracteres** para decidir si mostrar el botón. El texto puede ser largo y aun así caber en 2 líneas (depende del ancho del contenedor y el font-size).

**Patrón correcto — medir el DOM:**

```tsx
const [expanded, setExpanded] = useState(false);
const [isClamped, setIsClamped] = useState(false);
const textRef = useRef<HTMLParagraphElement>(null);

useLayoutEffect(() => {
  if (!expanded && textRef.current) {
    setIsClamped(textRef.current.scrollHeight > textRef.current.clientHeight);
  }
}, [text, expanded]);   // re-mide al cambiar el texto o al colapsar

// En JSX:
<p ref={textRef} className={!expanded ? "line-clamp-2" : ""}>
  {text}
</p>
{(isClamped || expanded) && (
  <button onClick={() => setExpanded(x => !x)}>
    {expanded ? "Ver menos" : "Ver más"}
  </button>
)}
```

- `useLayoutEffect` (no `useEffect`) — mide antes del paint, evita flash
- La condición `isClamped || expanded` garantiza que "Ver menos" siga visible tras expandir
- Al colapsar (`expanded → false`), el effect re-mide y actualiza `isClamped`
- Aplica a cualquier texto largo en cards: justificaciones, descripciones, notas

## URLs generadas por IA (SSRF guard, cuándo NO usar validateUrl, dm-referentes, dm-benchmark-empresas, ausencia de URL) → `.claude/rules/urls-ia.md` (carga sola al tocar `lib/`, `app/api/` o `components/doble-materialidad/`)

## Deploy — app-responsable (may-2026)

**Push a `main` → auto-deploy automático** a `https://app.responsable.net`.
GitHub `Responsable-mx/app-responsable` conectado a Vercel (integración GitHub App, may-2026).
`vercel --prod` ya no es necesario para este proyecto.

### OneDrive Files-On-Demand — defensa obligatoria

Repo vive bajo `C:\Users\…\OneDrive\…\app-responsable`. OneDrive puede convertir archivos a placeholders **online-only** entre Edit y commit, causando que `git status` los omita y se pierdan silenciosamente en el push. Caso real may-2026 con feature questionnaire-snapshots: 5 archivos editados invisibles a git, recuperados con `[System.IO.File]::ReadAllBytes` + rewrite.

**Defensas instaladas**:
- `scripts/pin-onedrive.mjs` — corre `attrib +P /S /D` recursivo.
- `npm run pin:onedrive` / `npm run check:onedrive` — pin manual + check de cuántos online-only.
- `.husky/pre-commit` — ejecuta `pin:onedrive` + `npx tsc --noEmit` antes de cualquier commit. Activado vía `git config core.hooksPath .husky` (correr 1 vez por clone).
- `npm run predeploy` — atajo manual pre-push (pin + tsc).

**Síntomas a vigilar**: `git status` no muestra archivo que Edit/Read sí ven; tamaño en disco normal pero `git hash-object` y `HEAD:ruta` matchean a pesar de cambios. Si pasa, correr `npm run pin:onedrive` y re-verificar.

### Deploy flow ágil

1. **Antes de commit**: hook pre-commit ejecuta automáticamente pin + tsc. Si tsc falla, fix antes de continuar.
2. **Antes de push manual** (opcional, validar build): `npm run predeploy`.
3. **Push**: `git push` — Vercel detecta + buildea + deploya solo HEAD.
4. **Commits no-funcionales** (docs/chores): NO hay token que evite el build — `[skip vercel]` está REFUTADO (medido 28-ago-2026 en ESTE repo: 4 de 4 commits con ese token se construyeron igual; ver `~/.claude/CLAUDE.md` § Git push). Acumularlos y subirlos junto con el siguiente cambio funcional.
5. **Multiple commits**: acumular localmente, push único al terminar. Vercel buildea sólo HEAD (memoria global).
6. **Migración SQL aditiva** (CREATE TABLE / ADD COLUMN / CREATE INDEX): aplicar a Supabase ANTES del push para evitar runtime errors entre los 2 pasos. Helper `node ~/.claude/scripts/apply-sql.mjs supabase/migrations/NNNN_xxx.sql --project=lyideepglavkmuuujoqz`. Destructiva pide OK textual + `--confirm-destructive`.
7. **Verificación post-deploy**: `curl -sI https://app.responsable.net` debe devolver 200 o redirect a login.

## Cache breakpoints IA

`buildSystemBlocks` de `lib/ai/roles.ts` emite **2** cache breakpoints `ephemeral`:
1. `contextBlock` (preámbulo del cliente) — al cambiar de rol con mismo cliente, hit.
2. `roleBlock` (rol + reglas + navegación) — turnos subsecuentes con mismo (cliente, rol), hit.

Resultado: ~50% ahorro vs 1 solo breakpoint cuando el consultor cicla entre Aurora/Rebeca/Elena/Valeria sobre el mismo cliente. Si agregas un tercer breakpoint (max 4 permite Anthropic), considerar dónde corta mejor el caso de uso.

**Pre-warm caché (sesión 40):** `POST /api/clients/[id]/warm-context` dispara llamada `max_tokens=1` con los system blocks del cliente. `ClientTabs` lo llama al montar (fire-and-forget). El primer mensaje del consultor paga `cache_read` (~10%) en lugar de `cache_write` (~25x más caro que read).

## Herramientas conectadas — patrón catálogo unificado (may-2026)

`app/(dashboard)/configuracion/herramientas/page.tsx` usa un único `TOOL_CATALOG` en lugar de dos arrays separados. La página se auto-categoriza en "Conectadas" vs "Propuestas".

**Al implementar una herramienta propuesta:**
1. Cambiar `implemented: false → true` en `TOOL_CATALOG`
2. Añadir `healthKey` apuntando a la función en `HEALTH_CHECKS`
3. Agregar la función de check en `HEALTH_CHECKS` si no existe aún

Los health checks se dedupen automáticamente por key (Voyage Embeddings + Voyage Rerank comparten un solo ping). Si `implemented` es `true` pero no hay `healthKey`, la tarjeta muestra `inactive` — agregar siempre el check.

**Herramientas activas (implemented=true):** Voyage Embeddings, Voyage Rerank, LlamaParse, Mistral OCR, QStash, Anthropic Batch API, Upstash Redis, Gemini Flash 2.0.
**Propuestas (implemented=false):** (ninguna)

**Gemini Flash 2.0 (may-2026):** `lib/ai/gemini.ts` — cliente singleton fail-open. Usado en ai-fill como primer fast path (antes de Haiku). JSON mode, `responseMimeType: "application/json"`. Si no hay GOOGLE_AI_API_KEY o falla → cae a Haiku → cae a Sonnet+web_search. Env var: `GOOGLE_AI_API_KEY`.

**Upstash Redis (may-2026):** `lib/cache/redis.ts` — cliente singleton fail-open. Caché activo en:
- `dm-benchmark/route.ts` POST compare: verifica cache antes de Batch API. GET: escribe cache cuando batch→done. TTL 14d.
- `dm-referentes/route.ts` generate_topics: verifica cache antes de Sonnet. Escribe tras DB store. TTL 30d.
- Env vars necesarias: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (misma cuenta que QStash).

## Fuentes únicas canónicas — NO duplicar (audit jul-2026)

Estas 4 lógicas nacieron duplicadas y divergieron, causando bugs de cara al cliente. Ahora hay una sola fuente por cada una; al tocar el tema, **importar de aquí, nunca reimplementar**:

- **Clasificación de cuadrante de doble materialidad** → `lib/dm/materiality-quadrant.ts` (`classifyIroByScore`, `classifyQuadrant`, `scoreToAxis`, `resolveIroAxes`). Umbral canónico = midpoint 3 (escala 1-5) / eje≥5. Lo consumen `DoubleMaterialidadTab` (conteos KPI) y `MatrizDM` (gráfica). Antes divergían (`>=2` vs `>=3`) → mismo IRO salía "doble material" en el resumen y "en seguimiento" en la matriz.
- **Precios de IA** → `lib/ai/pricing.ts` (`MODEL_PRICES`, `priceForModel`). Haiku 4.5 $1/$5, Opus 4.8 $5/$25, Sonnet $3/$15; voyage-3-lite $0.02 especial. Lo consumen `usage.ts` (total + byStage + byClient) y `ai-costs`. NUNCA hardcodear tablas de precio inline.
- **Fecha "hoy" de operación** → `lib/date.ts` `hoyEnMexico()` (IANA `America/Mexico_City`, `YYYY-MM-DD`). Usarla en toda lógica de "hoy/vencido/mes"; NUNCA `new Date().toISOString().slice(0,10)` (eso es UTC del servidor → falso-positivo de 6h en la tarde CDMX). `computeStatus(a, today?)` la usa por default; el arg `today` inyectable permite tests deterministas y reuso en lotes.

## Benchmark competitivo OPCIONAL en el reporte DM (audit jul-2026)

Con `SHOW_BENCHMARK_STAGES=false` (estado actual) el pipeline DM genera el reporte final SIN benchmark. Patrón: `result_id` es opcional en `dm-report` y `export-dm-pdf` (placeholder si falta); `ReporteSection` recibe `benchmarkRequired` y usa `hasMatriz` como gate cuando el benchmark está oculto. Si se reactiva el benchmark (`SHOW_BENCHMARK_STAGES=true`), el flujo vuelve a exigirlo. NO volver a acoplar el reporte al benchmark de forma dura.

## Auth de sub-recursos de cliente — regla dura (audit jul-2026, D-190)

TODO handler bajo `clients/[id]/*` (y `materiality-topics`, `client-services/[id]`) debe usar `requireConsultorForClient(clientId)` para lectura Y mutación — NUNCA `requireUser` solo (no discrimina `role=cliente` y con service-role saltaría RLS → IDOR cross-tenant). Extraer el `id`/`clientId` de params ANTES del auth. Este es el gate que habilita onboardear clientes externos: si se agrega un endpoint nuevo bajo `clients/[id]`, aplica la misma regla.
