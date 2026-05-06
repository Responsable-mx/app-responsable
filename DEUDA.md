# DEUDA.md — App ResponSable

Registro de deuda técnica acumulada. Actualizar al cerrar cada sesión de auditoría.

## Severidad

| Icono | Nivel | Criterio |
|-------|-------|----------|
| 🔴 | Crítica | Bloquea MVP o produce errores en producción |
| 🟡 | Moderada | Afecta calidad o mantenibilidad; no bloquea |
| 🟢 | Menor | Nice-to-have, refactor cosmético |

---

## Deuda activa

---

### Bloque D-89–D-98 — Hallazgos design critique may-2026 (sesión 2)

### 🔴 D-89 — Configuración abre en blanco sin contenido default
- **Descripción**: `/configuracion` muestra lista de sub-secciones izquierda (~180px) con área derecha 100% vacía. No hay auto-selección de primera sección.
- **Impacto**: Dead end inmediato — el usuario no sabe qué hacer, la pantalla no tiene CTAs ni contenido.
- **Fix**: Redirect `GET /configuracion` → `/configuracion/usuarios`. O render `<UsersManager>` por default en el layout.
- **Esfuerzo**: 5min — 1 línea en `configuracion/page.tsx`

### 🔴 D-90 — ACCESO RÁPIDO del sidebar no navega al hacer clic
- **Descripción**: Los items de "ACCESO RÁPIDO" (Distribuidora Altamira + EPH) aparecen como links con badge de seniority pero no hacen nada al hacer clic. La acción más visible del sidebar es no-funcional.
- **Impacto**: El acceso directo más eficiente de toda la app (1 clic al proyecto activo) es un dead end.
- **Fix**: Envolver item en `<Link href="/clientes/[id]">` con el ID real del cliente. Agregar `title={fullClientName}` para nombre completo en hover.
- **Esfuerzo**: 30min — requiere pasar client IDs al sidebar component

### 🔴 D-91 — Roles del Chat IA sin descripción permanente
- **Descripción**: El stepper Aurora→Rebeca→Elena→Valeria solo muestra nombre + label de rol (AUTOR/REVISOR/ELEVADOR/VALIDADOR). No hay descripción de qué hace cada rol. Solo hover title. Para un consultor nuevo, el feature central de la app es opaco.
- **Impacto**: Fricción bloqueante en primer día de uso. El flujo de cadena de calidad, que es el principal diferenciador de la app, queda oculto.
- **Fix**: Agregar 1 línea de descripción siempre visible debajo del label en cada avatar del stepper: "Genera borrador inicial" / "Detecta fallas y riesgos" / "Eleva narrativa estratégica" / "Valida Definition of Done"
- **Esfuerzo**: 20min — 4 strings en `ChatRolePipeline` component

### 🟡 D-92 — Chat IA requiere elegir rol antes de escribir — sin default explícito
- **Descripción**: El input del chat dice "Escribe a Aurora..." lo que implica que Aurora está activa, pero no hay indicador visual claro de que Aurora es la activa (dot ●, fondo, borde). El usuario debe inferir el estado activo.
- **Fix**: Dot ● verde o fondo ligeramente marcado en el avatar activo. Aurora activa por default desde el inicio. Pipeline avanza automáticamente después de enviar (sugerencia al usuario: "¿Continuar con Rebeca?").
- **Esfuerzo**: 45min

### 🟡 D-93 — Cronograma toolbar mezcla acciones y vistas sin separación
- **Descripción**: La toolbar del tab Cronograma muestra "+ SERVICIO · GANTT PDF · LISTA · GANTT" — 4 botones al mismo nivel visual mezclando acciones destructivas/creativas (+ SERVICIO, GANTT PDF) con controles de vista (LISTA, GANTT). El usuario no distingue qué cambia el estado vs qué cambia la visualización.
- **Fix**: Separar con divider vertical: acciones a la izquierda (`+ Servicio` | `↓ PDF`), vistas como segmented control a la derecha (`[Lista | Gantt]` con estado activo marcado).
- **Esfuerzo**: 1h

### 🟡 D-94 — Equipo: 4 filtros siempre visibles sin progressive disclosure
- **Descripción**: Chips de STATUS (Pendientes/En curso/Completadas/Retrasadas) + 3 dropdowns (CONSULTOR, PROYECTO, RANGO) ocupan ~80px siempre visibles. Los dropdowns rara vez se usan simultáneamente.
- **Fix**: Mantener chips STATUS visibles (más usados). Colapsar 3 dropdowns en botón "Filtrar ▼" con badge de filtros activos (ej: "Filtrar · 2").
- **Esfuerzo**: 1.5h

### 🟡 D-95 — Cuestionario: badge "✓ validado" en todos los campos de secciones completas
- **Descripción**: Cuando una sección está al 100%, cada campo muestra badge "✓ validado". En una sección con 14/14 campos, esto es 14 badges redundantes — la validación deja de comunicar excepciones y se convierte en ruido.
- **Fix**: Solo mostrar badge en campos con fuente externa explícita o validación manual individual. Ocultar por default cuando toda la sección está validada (el progress bar 100% ya comunica el estado).
- **Esfuerzo**: 45min

### 🟡 D-96 — "Quitar validación" visible aunque stats.validated === 0
- **Descripción**: El botón "Quitar validación" en Materialidad es visible aunque no haya temas validados, lo cual no tiene sentido semántico.
- **Fix**: `hidden` o `disabled` + `opacity-50 cursor-not-allowed` cuando `stats.validated === 0`
- **Esfuerzo**: 5min

### 🟡 D-97 — Cuentas Demo mezcladas con consultores reales en Equipo
- **Descripción**: "Demo Altamira (Elian)", "Demo Altamira (Gwenaelle)", "Demo Altamira (Nicolás)" aparecen en la tabla de Equipo global mezclados con consultores reales. Generan confusión y distorsionan métricas de carga.
- **Fix**: Agregar columna `is_test_account boolean default false` en `authorized_users` o filtrar por dominio de email. Badge "TEST" visible + excluir de métricas de carga por default con toggle "Mostrar cuentas de prueba".
- **Esfuerzo**: 2h (migración + UI)

### 🟢 D-98 — Tablas Equipo y Consultores sin zebra stripe
- **Descripción**: Las tablas en /equipo (POR CONSULTOR) y en el tab CONSULTORES del cliente no tienen zebra stripe — dificulta el seguimiento horizontal de filas en tablas de 5+ columnas.
- **Fix**: `even:bg-slate-50` en `<tr>` de ambas tablas.
- **Esfuerzo**: 10min

---

### ~~🔴 D-80 — Home = Chat IA vacío, flujo mental invertido~~ ✅ RESUELTO
- Redirect middleware a `/clientes` aplicado. "Chat IA" en nav actualizado.

### 🔴 D-81 — Roles del chat IA (Rebeca/Elena/Valeria) sin affordance de interactividad
- **Descripción**: Los avatares de Rebeca, Elena y Valeria están greyed-out. No hay hover state, cursor, ni tooltip que indique que son clickeables para cambiar de rol. Parecen disabled.
- **Impacto**: Usuarios no descubren cómo cambiar de rol sin documentación externa. La cadena de calidad Aurora→Valeria, que es el feature central de la app, queda oculta.
- **Fix**: Agregar `cursor-pointer`, hover state + tooltip "Cambiar a Revisora — detecta fallas y omisiones" en cada avatar. Dot ● "Activo" en el rol seleccionado.
- **Esfuerzo**: 45min

### 🟡 D-82 — 3 niveles de tabs en Configuración (Configuración → Identidad cliente → Sectores)
- **Descripción**: `/configuracion` tiene tabs horizontales (Usuarios/Permisos/Catálogos/…), dentro de Catálogos hay sub-tabs (Identidad/Cumplimiento/…), y dentro de cada sub-tab hay pills de categoría. 3 niveles de navegación anidados visibles simultáneamente.
- **Impacto**: Usuarios admin se pierden; no saben qué nivel están editando.
- **Fix**: Convertir el nivel superior a sidebar nav izquierdo (patrón SAP Fiori, Notion Settings). Conservar sub-tabs + pills internos (2 niveles máximo visibles).
- **Esfuerzo**: 2-3h

### ~~🟡 D-83 — "Equipo" en nav global vs tab de cliente — mismo label, scope opuesto~~ ✅ RESUELTO
- Tab del cliente renombrado a "CONSULTORES". Nav global sigue siendo "Equipo".

### 🟡 D-84 — Sugerencias de chat genéricas cuando hay cliente seleccionado
- **Descripción**: Los 4 prompts de sugerencia en el chat (tanto en `/chat` como en el tab del cliente) son siempre los mismos prompts genéricos. No cambian con el contexto del cliente.
- **Impacto**: Se pierde la mayor oportunidad de reducir carga cognitiva: decirle al consultor exactamente qué puede hacer con ese cliente ahora.
- **Fix**: Cuando hay cliente seleccionado, generar sugerencias dinámicas basadas en el estado real: "Analiza los 5 temas de doble materialidad de Altamira", "Redacta la introducción del reporte GRI con los datos del cuestionario". Puede ser strings template simples (sin IA) interpolando datos del cliente.
- **Esfuerzo**: 1.5h

### 🟡 D-85 — "MIS PROYECTOS" en sidebar duplica acceso ya dado por nav "Clientes"
- **Descripción**: El sidebar muestra una sección "MIS PROYECTOS" con links a clientes específicos (ej: Distribuidora Altamira + EPH). El nav ya tiene "Clientes" que lleva a la lista completa. El nombre del cliente además aparece en breadcrumb + H1 cuando estás dentro.
- **Impacto**: Ruido visual. 4 instancias del nombre del cliente en pantalla simultáneamente cuando estás en `/clientes/[id]`.
- **Fix**: Si `/clientes` se vuelve home (D-80), MIS PROYECTOS puede ser un pin en la lista de clientes (star ★ que fija al top). Eliminar del sidebar.
- **Esfuerzo**: 1h

### 🟡 D-86 — Cronograma header redundante dentro del tab
- **Descripción**: El tab "Cronograma" muestra dentro un h2 "CRONOGRAMA DEL CLIENTE" + descripción. El usuario ya sabe que está en Cronograma por el tab activo.
- **Impacto**: ~80px de altura desperdiciada. El contenido real (servicios/actividades) se empuja hacia abajo.
- **Fix**: Eliminar h2 y descripción. Mantener solo la barra de acciones (+ Servicio, PDF, Lista/Gantt).
- **Esfuerzo**: 10min

### 🟢 D-87 — Copy inconsistente: "IA llena 7 pasos" vs "PASO 1 DE 9"
- **Descripción**: El banner del Cuestionario dice "IA llena 7 pasos automáticamente" pero el wizard tiene 9 pasos.
- **Fix**: "IA puede completar automáticamente hasta 7 de los 9 pasos con datos públicos verificables"
- **Esfuerzo**: 2min

### 🟢 D-88 — "ADMIN" label redundante en headers de Equipo y Configuración
- **Descripción**: Ambas páginas muestran "ADMIN" como prefix del título de página. El rol ya aparece en el perfil del sidebar (nblondel / Admin). Repetido sin propósito.
- **Fix**: Eliminar el label ADMIN de los page headers.
- **Esfuerzo**: 5min

### 🟡 D-04 — Metodología ResponSable: pasos no definidos
- **Descripción**: El equipo aún no ha definido los pasos reales de la metodología.
- **Impacto**: La KPI card de Metodología no existe en `ClientTabs`. Cuando se defina, agregar.
- **Responsable**: Equipo metodología ResponSable
- **Esfuerzo**: Decisión de negocio, luego 30min de código


---

## Deuda resuelta (sesión 13 — may-2026, auditoría IA)

| ID | Descripción | Resuelto |
|----|-------------|---------|
| D-73 | `persistSession` catch silencioso — `console.error` añadido para debug en prod | may-2026 |
| D-74 | Tipos beta Anthropic SDK (`cache_control`, `web_search`) — `eslint-disable` justificados documentados | may-2026 |
| D-75 | Elena usaba Sonnet en código (Opus en comentario) — `claude-opus-4-7` aplicado en `models.ts` | may-2026 |
| D-76 | `doc-fill` sin rate limit — misma capa DB (15 calls/min) que `ai-fill` añadida | may-2026 |
| D-77 | `doc-fill` `max_tokens: 4096` sobredimensionado — reducido a `2000` (output típico <1000) | may-2026 |
| D-78 | `extract-test` sin `cache_control` en system prompt — ephemeral añadido | may-2026 |

## Deuda resuelta (sesión 12 — may-2026, auditoría seguridad)

| ID | Descripción | Resuelto |
|----|-------------|---------|
| D-67 | `/dev/app-preview` bypass en producción — eliminado; unified guard `NODE_ENV !== 'production'` | may-2026 |
| D-68 | ReactMarkdown sin `rehype-sanitize` — `rehypePlugins={[rehypeSanitize]}` en `ChatMessageBubble` | may-2026 |
| D-69 | CSP + HSTS ausentes — `Content-Security-Policy` + `Strict-Transport-Security` en `next.config.ts` | may-2026 |
| D-70 | Rate limit `send-code` solo por email — migración 0039 + check por IP (10/5min) en `send-code` | may-2026 |
| D-71 | `listUsers(perPage:200)` — reducido a `perPage:50` en `login-code` | may-2026 |
| D-72 | `isAuthorizedEmailSync` deprecated activo — función + tests eliminados | may-2026 |

---

## Deuda resuelta (sesión 11 — may-2026)

| ID | Descripción | Resuelto |
|----|-------------|---------|
| D-10 | Trazabilidad Chat→Cuestionario — `buildClientContext` inyecta campos llenos; LLM cita `[campo:key]`; UI convierte a link `/clientes/{id}?tab=cuestionario` | may-2026 |

## Deuda resuelta (sesión 10 — may-2026)

| ID | Descripción | Resuelto |
|----|-------------|---------|
| D-59 | Stale JWT en `/configuracion` — layout.tsx ahora llama `requireAdmin()` (DB) antes de renderizar | may-2026 |
| D-61 | Rate limit in-memory de ai-fill eliminado — capa única DB cross-instance, suficiente para piloto | may-2026 |
| D-64 | Costo IA por modelo correcto — `lib/ai/usage.ts` agrupa por `model` y aplica Haiku $1/$5 vs Sonnet $3/$15 | may-2026 |
| D-66 | ChatWindow (1080→812L) + QuestionnaireTab refactorizados — extraídos `ChatMessageBubble`, `ChatEmptyState`, `chat-types.ts`, `WizardStepNav`, `AiBulkBanner` | may-2026 |

## Deuda resuelta (sesión 5 — may-2026)

| ID | Descripción | Resuelto |
|----|-------------|---------|
| D-54 | Native `<select>` en 7 lugares — violaba regla SelectField | may-2026 — migrados a SelectField en ActivityEditorModal, TemplatesManager (x2), TeamTab (x3), ChatWindow, QuestionnaireTab |
| D-55 | `team/occupancy` full-scan sin filtro temporal — actividades completadas acumulándose | may-2026 — `.or("actual_end.is.null,actual_end.gte.${oneYearAgoStr}")` en query de actividades |
| D-56 | PATCH `/api/stage-templates/:id` audit log sin snapshot `before` | may-2026 — `getTemplate(id)` previo al UPDATE + before incluido en `logChange` |
| D-57 | `getActivityOwnerClient` tipo assertion doble-cast 3 líneas — fragile | may-2026 — colapsado a `data as any` con eslint-disable comment |

---

## Deuda resuelta

| ID | Descripción | Resuelto |
|----|-------------|---------|
| R-01 | Matriz de materialidad sin patrón BCG — solo barra de progreso | may-2026 (mockup) |
| R-02 | Diseño SaaS-startup en lugar de B2B corporativo | may-2026 |
| R-03 | Sin breadcrumb en vista cliente | may-2026 |
| R-04 | Tabs sin badges de progreso | may-2026 |
| R-05 | Emoji en iconos de sección | may-2026 |
| R-06 | `.gitignore` no excluía `.claude/` | may-2026 |
| R-07 | `/dev/app-preview` requería login en producción | may-2026 (eliminado) |
| R-08 | Mockup `AppShell` no conectaba a backend real | may-2026 (eliminado, rutas reales activas) |
| R-09 | `ClientTabs` real solo tenía 2 tabs (Contexto + Servicios) | may-2026 (4 tabs + KPI header) |
| R-10 | Chat sin Copy/Thumbs/Export/Retry (S-Peak parity) | may-2026 (portado a ChatWindow real) |
| D-01 | Cuestionario sin backend (Fase 2) | may-2026 — QuestionnaireTab + autosave + AI-fill implementados |
| D-02 | Matriz de Materialidad sin backend (Fase 3) | may-2026 — MaterialityTab + tabla `materiality_topics` + endpoints implementados |
| D-11 | chat_sessions usa service role — aislamiento solo por código, sin RLS efectiva | may-2026 — documentado con nota de seguridad + patrón clarificado |
| D-12 | IDOR en PATCH/DELETE de materiality_topics — sin verificación de ownership | may-2026 — `clientId` requerido en body/query + `.eq("client_id",…)` en DB |
| D-13 | stepKey sin validación — path traversal potencial en ai-fill | may-2026 — regex `VALID_STEP_KEY = /^[a-z0-9-]{1,64}$/` |
| D-14 | Sin rate limiting en `/api/…/ai-fill` — Anthropic sin cota por usuario | may-2026 — token bucket in-memory 15 calls/min por email |
| D-15 | Autosave sin tope de reintentos — retry infinito en cuestionario | may-2026 — `MAX_RETRIES = 5`, banner de error al agotar |
| D-16 | Stale closure en `aiFillAll` — setState síncrono borraba edits concurrentes | may-2026 — functional setState + snapshot `mergedForSave` |
| D-17 | Demo ALTAMIRA_ID creaba filas reales en DB al persistir sesión | may-2026 — guard `if (clientId === ALTAMIRA_ID) return` en `persistSession()` |
| D-18 | Archive de sesión silenciaba error — chat vaciaba aunque DELETE fallaba | may-2026 — invertido: DELETE primero, `onArchive` solo si ok, toast de error |
| D-19 | Type guard `loadSession` roto por precedencia de `\|\|` — mensajes inválidos pasaban | may-2026 — refactorizado a `flatMap` unambiguo |
| D-20 | `extractJsonObject` con regex no-greedy truncaba JSON anidado en code blocks | may-2026 — extrae content entre backticks primero, luego balanced-brace parser |
| D-21 | `isChatStreamEvent` no validaba campo `text` en delta — type guard permisivo | may-2026 — añadida verificación `typeof text === "string"` |
| D-22 | Plantilla de materialidad sin aviso de sector — confundía aplicabilidad | may-2026 — disclaimer visible antes del botón "Cargar plantilla" |
| D-23 | `authorized_users` vacío fallback silencioso — invisible en logs | may-2026 — `console.error` explícito con query de diagnóstico |
| D-24 | `ClientAvatar` aceptaba URLs arbitrarias sin validación + sin fallback | may-2026 — validación `startsWith("https://"\|"http://")` + `onError` hide |
| D-25 | Chat sin tope de mensajes — payloads masivos en sesiones largas | may-2026 — `MAX_MESSAGES_PER_SESSION = 200`, trunca al guardar |
| D-26 | URLs de fuente en cuestionario sin validación — cualquier string aceptado | may-2026 — `isValidUrl` check + error inline + botón disabled |
| D-27 | `ChatWindow` tenía 2 `exportConversation` — función inferior conectada al botón | may-2026 — eliminada duplicada, botón redirigido a `exportConversationMd()` |
| D-28 | `TabErrorBoundary` exponía stack trace crudo en producción | may-2026 — `<details>` envuelto en `process.env.NODE_ENV !== "production"` |
| D-29 | `CommandPalette` lista todos los clientes sin scoping — riesgo futuro RBAC | may-2026 — documentado con comentario; aceptado para 8 usuarios piloto |
| D-30 | Botón "Cargar plantilla" de materialidad activo mientras cargaba — doble-click race | may-2026 — `disabled={busyInit}` añadido |
| D-31 | `uso-ia/page.tsx` usaba tokens `stone-*` y `rounded-xl` fuera del design system | may-2026 — migrado a `slate-*` + `rounded` |
| D-32 | RLS `chat_sessions_owner_delete` permitía hard-DELETE directo desde cliente JS | may-2026 — migración `0031` elimina política; solo service role puede hard-delete |
| D-03 | Chat IA sin contexto inline en tabs del cliente | may-2026 — sprint añadió tab "Chat IA" en `ClientTabs` con `<ChatWindow clientId>` preseleccionado |
| D-07 | Export PDF del cliente no existía | may-2026 — `@react-pdf/renderer` + `/api/clients/[id]/export-pdf` + `ExportPdfButton` |
| D-33 | IDOR en `/api/client-services/[id]` PATCH/DELETE sin ownership check | may-2026 — `getClientService(id)` antes de mutar, 404 si no existe |
| D-34 | URLs de documentos sin `.url()` — aceptaban `javascript:` | may-2026 — `.url("URL inválida")` en las 3 URLs de `ClientInputSchema` |
| D-35 | `ExportPdfButton` usaba `alert()` en lugar de `useToast()` | may-2026 — migrado a `push("error", msg)` |
| D-36 | PATCH/DELETE `client-services` sin `logChange()` | may-2026 — `void logChange(...)` en ambas mutaciones |
| D-37 | `listConsultorProjects` 3 queries secuenciales, queries 2+3 independientes | may-2026 — `Promise.all([clients, userRow])` |
| D-38 | Prop `page` dead code en `Footer` de `client-report.tsx` | may-2026 — prop eliminado |
| D-39 | Sidebar SWR sin manejo de `error` — fallo silencioso en "Mis proyectos" | may-2026 — `error` desestructurado, array vacío en error |
| D-05 | Sin paginación/search server-side en lista de clientes | may-2026 — `listClients(filter)` + `GET /api/clients?q=` + SWR debounce 300ms en `ClientsList` |
| D-06 | Audit log faltante en endpoint de cuestionario | may-2026 — `logChange()` ya integrado en `/api/clients/[id]/questionnaire` (PATCH) |
| D-08 | Stone vs slate: tokens residuales en producción | may-2026 — pase global `stone-*`→`slate-*` + `rounded-xl`→`rounded` en 24 componentes |
| D-09 | `ConfirmDialog` deprecado activo en CatalogsManager/PromptsManager | may-2026 — `ConfirmDialog.tsx` ya no existe; ambos componentes usan `ConfirmModal` |
| D-42 | `client-services` PATCH/DELETE con `requireUser` — consultor podía mutar servicios | may-2026 — `requireAdmin()` en PATCH y DELETE |
| D-43 | RLS `service_stages`/`stage_activities` sin check de rol admin — defensa en profundidad rota | may-2026 — migración `0033`: políticas mutación restringidas a `role = 'admin'` |
| D-44 | Doble `requireAdmin()` en PATCH activities (2 round-trips Supabase) | may-2026 — variable compartida `adminEmail` — 1 sola llamada |
| D-45 | `ClientCronogramaTab` SWR sin `error` — fallo silencioso en carga de servicios | may-2026 — `servicesError` desestructurado + banner de error visible |
| D-46 | `ServiceStagesPanel` sin `error` SWR + spinner texto en lugar de Skeleton | may-2026 — `error` + skeleton animado + mensaje de error |
| D-47 | `ClientServicesTab` usaba clase raw `.skeleton` | may-2026 — resuelto al eliminar archivo muerto (D-53) |
| D-48 | `StageRow` prop `consultorEmails` declarado pero no consumido | may-2026 — eliminado del tipo y del call site |
| D-49 | `{stages.length === 0 && !isAdmin && null}` — expresión dead-null en JSX | may-2026 — eliminada |
| D-50 | Iconos emoji en UI de datos en `ClientServicesTab` | may-2026 — resuelto al eliminar archivo muerto (D-53) |
| D-51 | `await import("zod")` dinámico en handler POST `/api/clients/:id/stages` | may-2026 — import estático `import { z } from "zod"` |
| D-52 | PATCH `/api/stages/:id` sin snapshot `before` en audit log | may-2026 — fetch `before` previo al update + incluido en `logChange` |
| D-53 | `ClientServicesTab` dead code — 0 consumers en toda la app | may-2026 — archivo eliminado |

---

## Hito: Sprint features may-2026 + limpieza de deuda completa

El sprint may-2026 implementó Cuestionario (D-01) y Materialidad (D-02) como features completos con backend, AI-fill, autosave y audit log. La auditoría post-sprint encontró 22 items nuevos (D-11–D-32), todos cerrados en la misma sesión.

**Estado post-limpieza:**
- Cero ítems 🔴 Críticos activos
- 4 ítems 🟡 Moderados: D-04 D-05 D-06 D-07
- 3 ítems 🟢 Menores: D-08 D-09 D-10

**Sesión may-2026 (seniority + equipo):**
- Seniority levels: catálogo `seniority_levels` en `catalog_items`, columna en `authorized_users`, override por proyecto en `client_consultors`
- Tab Equipo en `ClientTabs`: asignar/remover consultores por cliente con seniority override
- API `/api/clients/[id]/consultors` + `/[userEmail]` (GET público, POST/PATCH/DELETE admin + audit log)
- `UsersManager`: columna seniority + select desde catálogo + stone→slate (D-08 parcial)
- Migración `0030` aplicada a producción
- Patrón clave: **seniority default en usuario, override en asignación** — no duplicar lógica en dos tablas

**Próximas fases:**
- D-06: audit log en endpoint de cuestionario (30min)
- D-08: grep residuos stone→slate en ClientForm y ChatWindow
- D-07: export PDF entregable

---

*Última auditoría: may-2026 — design critique sesión 2 (D-89–D-98 agregados). D-80 y D-83 cerrados. Próxima revisión: ver tareas programadas en `MEMORY.md`.*
