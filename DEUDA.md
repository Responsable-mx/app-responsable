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

### 🟡 D-03 — Chat IA sin contexto inline en tabs del cliente
- **Descripción**: El `/chat` real opera en su propia ruta. No hay un tab "Chat" dentro de `/clientes/[id]` que cargue contexto del cliente directamente.
- **Fix sugerido**: Agregar 5to tab "Chat IA" en `ClientTabs` que renderice `<ChatWindow>` con `clientId` preseleccionado, o un drawer lateral.
- **Esfuerzo**: 2-3h

### 🟡 D-04 — Metodología ResponSable: pasos no definidos
- **Descripción**: El equipo aún no ha definido los pasos reales de la metodología.
- **Impacto**: La KPI card de Metodología no existe en `ClientTabs`. Cuando se defina, agregar.
- **Responsable**: Equipo metodología ResponSable
- **Esfuerzo**: Decisión de negocio, luego 30min de código

### 🟡 D-05 — Sin paginación en lista de clientes
- **Descripción**: `/clientes` usa filter client-side. Funciona para <100 clientes, no escala.
- **Fix sugerido**: SWR + `/api/clients?page=&limit=&search=` server-side.
- **Esfuerzo**: 3-4h

### 🟡 D-06 — Audit log faltante en endpoint de cuestionario
- **Descripción**: `logChange()` ahora cubre materialidad (D-12, may-2026). Falta integrar en `/api/clients/[id]/questionnaire` (POST/PATCH).
- **Fix sugerido**: Llamar `logChange({ actorEmail, entityType: "questionnaire_response", entityId: clientId, action, before, after })` en cada mutación del endpoint de cuestionario.
- **Esfuerzo**: 30min

### 🟡 D-07 — Export PDF del cliente no existe
- **Descripción**: No hay forma de exportar el contexto + servicios + cuestionario + materialidad de un cliente en un PDF entregable al cliente final.
- **Fix sugerido**: Integrar `@react-pdf/renderer` o ruta `/api/clients/[id]/export-pdf` con plantilla.
- **Esfuerzo**: 1-2 días

### 🟢 D-08 — Stone vs slate: tokens residuales
- **Descripción**: Pase global `stone-` → `slate-` completado en `uso-ia/page.tsx` (D-31, may-2026). Pueden quedar instancias en `ClientForm`, `ChatWindow` y otros componentes legacy.
- **Fix sugerido**: `grep -r "stone-" components/ app/` y reemplazar remanentes.
- **Esfuerzo**: 1h

### 🟢 D-09 — `ConfirmDialog` deprecado activo en CatalogsManager y PromptsManager
- **Descripción**: `components/ConfirmDialog.tsx` es wrapper anterior; el nuevo estándar es `components/ui/ConfirmModal.tsx`.
- **Fix sugerido**: Migrar `CatalogsManager` y `PromptsManager` a `ConfirmModal`.
- **Esfuerzo**: 1h

### 🟢 D-10 — Sin trazabilidad Chat → Cuestionario
- **Descripción**: Los mensajes del chat IA no linkean a campos específicos del cuestionario.
- **Fix sugerido**: Cuando el cuestionario esté maduro, `buildClientContext` debe incluir field IDs; el chat puede citar `[ver campo X]`.
- **Esfuerzo**: 4-6h

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

---

## Hito: Sprint features may-2026 + limpieza de deuda completa

El sprint may-2026 implementó Cuestionario (D-01) y Materialidad (D-02) como features completos con backend, AI-fill, autosave y audit log. La auditoría post-sprint encontró 22 items nuevos (D-11–D-32), todos cerrados en la misma sesión.

**Estado post-limpieza:**
- Cero ítems 🔴 Críticos activos
- 5 ítems 🟡 Moderados: D-03 D-04 D-05 D-06 D-07
- 3 ítems 🟢 Menores: D-08 D-09 D-10
- Migración `0031` creada — aplicar a producción via `apply-sql.mjs`

**Próximas fases:**
- Aplicar migración 0031 a producción (eliminar RLS DELETE de chat_sessions)
- D-06: audit log en endpoint de cuestionario (30min)
- D-03: tab Chat IA inline en vista cliente
- D-07: export PDF entregable

---

*Última auditoría: may-2026 (sprint features + limpieza D-11/D-32). Próxima revisión: ver tareas programadas en `MEMORY.md`.*
