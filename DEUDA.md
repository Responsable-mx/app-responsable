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

### 🟡 D-04 — Metodología ResponSable: pasos no definidos
- **Descripción**: El equipo aún no ha definido los pasos reales de la metodología.
- **Impacto**: La KPI card de Metodología no existe en `ClientTabs`. Cuando se defina, agregar.
- **Responsable**: Equipo metodología ResponSable
- **Esfuerzo**: Decisión de negocio, luego 30min de código

### 🟡 D-59 — Stale JWT: admin degradado sigue viendo `/configuracion` en UI
- **Descripción**: Middleware lee `user_metadata.role` del JWT (escrito al login). Si un admin es degradado a consultor en DB, sigue accediendo a la UI de /configuracion hasta su próximo login.
- **Impacto**: UX inconsistente — UI accesible, pero endpoints bloquean con `requireAdmin()` contra DB. Sin riesgo de mutación.
- **Aceptado para piloto** (8 usuarios internos). Fix: forzar re-sync de metadata al cargar /configuracion.
- **Esfuerzo**: 2h

### 🟡 D-61 — Rate limit in-memory de ai-fill ineficaz en multi-instancia Vercel
- **Descripción**: `rateLimitMap` es `Map` por instancia serverless. En producción con N lambdas paralelas, el límite de 15 calls/min se multiplica por N. La capa 2 (DB `ai_calls` count) protege cross-instance pero tiene race entre `SELECT count` e `INSERT`.
- **Impacto**: Protección best-effort. Con 8 usuarios piloto el riesgo real es bajo.
- **Fix**: Redis/Upstash para rate limit distribuido, o aceptar capa 2 como definitiva y documentar.
- **Esfuerzo**: 3h (Redis) o 30min (documentar + eliminar capa 1 engañosa)

### 🟡 D-66 — `ChatWindow.tsx` (1074L) + `QuestionnaireTab.tsx` (1043L) monolíticos
- **Descripción**: Ambos componentes mezclan estado, fetching, renderizado y subcomponentes inline.
- **Impacto**: Difícil de testear, alto costo de modificación, riesgo de regresión. No bloqueante para piloto de 8 usuarios.
- **Fix**: Extraer hooks (`useChatStream`, `useQuestionnaireAutosave`) + subcomponentes (`ChatMessages`, `ChatInput`, `WizardStepPanel`).
- **Esfuerzo**: 4-6h cada uno

### 🟢 D-10 — Sin trazabilidad Chat → Cuestionario
- **Descripción**: Los mensajes del chat IA no linkean a campos específicos del cuestionario.
- **Fix sugerido**: Cuando el cuestionario esté maduro, `buildClientContext` debe incluir field IDs; el chat puede citar `[ver campo X]`.
- **Esfuerzo**: 4-6h

### 🟢 D-64 — Estimado de costo IA usa precio Sonnet para todos los roles (incluye Valeria/Haiku)
- **Descripción**: `lib/ai/usage.ts` y `app/api/cron/audit-health/route.ts` aplican `$3/M + $15/M` a todas las filas. Valeria usa Haiku (`$1/M + $5/M`). Campo documentado como `cost_usd_estimate_max` (worst-case), pero el panel lo muestra sin aclaración.
- **Fix**: Agrupar por `model` en la query y aplicar precio correcto, o agregar tooltip "(estimación conservadora)" en la UI.
- **Esfuerzo**: 2h

---

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

*Última auditoría: may-2026 (sprint features + limpieza D-11/D-32). Próxima revisión: ver tareas programadas en `MEMORY.md`.*
