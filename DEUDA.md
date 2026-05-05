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

### 🔴 D-01 — Cuestionario sin backend (Fase 2 pendiente)
- **Descripción**: El tab "Cuestionario" en `ClientTabs` muestra un placeholder "Próximamente". No existe schema, endpoint ni UI editable.
- **Impacto**: El consultor no puede capturar respuestas estructuradas del cuestionario por cliente.
- **Fix sugerido**:
  - Migración SQL: tabla `questionnaire_sections`, `questionnaire_fields`, `questionnaire_responses` (FK a `clients.id`).
  - Endpoint `GET/PATCH /api/clients/[id]/questionnaire`.
  - Componente `<QuestionnaireTab clientId>` con autosave y progreso por sección.
- **Esfuerzo**: 3-5 días (Fase 2)

### 🔴 D-02 — Matriz de Materialidad sin backend (Fase 3 pendiente)
- **Descripción**: El tab "Materialidad" en `ClientTabs` muestra un placeholder "Próximamente". El SVG BCG/McKinsey con 20 temas existe en el git history (`AppShell.tsx` eliminado) pero no está conectado a datos reales.
- **Impacto**: La matriz de doble materialidad — el entregable principal del MVP — no es funcional.
- **Fix sugerido**:
  - Migración SQL: tabla `materiality_topics(client_id, topic_key, label, x_pos, y_pos, color, size)`.
  - Endpoint `GET/PATCH /api/clients/[id]/materiality`.
  - Componente `<MaterialityTab clientId>` reusando el SVG del mockup eliminado (recuperar desde git si necesario).
- **Esfuerzo**: 3-5 días (Fase 3)

### 🟡 D-03 — Chat IA sin contexto inline en tabs del cliente
- **Descripción**: El `/chat` real opera en su propia ruta. No hay un tab "Chat" dentro de `/clientes/[id]` que cargue contexto del cliente directamente.
- **Fix sugerido**: Agregar 5to tab "Chat IA" en `ClientTabs` que renderice `<ChatWindow>` con `clientId` preseleccionado, o un drawer lateral.
- **Esfuerzo**: 2-3h

### 🟡 D-04 — Metodología ResponSable: pasos no definidos
- **Descripción**: El equipo aún no ha definido los pasos reales de la metodología (anteriormente "Comprender/Diseñar/Optimizar/Utilizar/Medir" — inventados para el mockup, ya eliminados).
- **Impacto**: La KPI card de Metodología no existe en `ClientTabs` actual. Cuando se defina, agregar.
- **Responsable**: Equipo metodología ResponSable
- **Esfuerzo**: Decisión de negocio, luego 30min de código

### 🟡 D-05 — Sin paginación en lista de clientes
- **Descripción**: `/clientes` usa filter client-side. Funciona para <100 clientes, no escala.
- **Fix sugerido**: SWR + `/api/clients?page=&limit=&search=` server-side.
- **Esfuerzo**: 3-4h

### 🟡 D-06 — Audit log no cubre mutaciones futuras (cuestionario, materialidad)
- **Descripción**: `logChange()` cubre endpoints admin (clients, prompts, users, catalogs). Cuando se implementen Fase 2/3, integrar audit log desde el día uno.
- **Fix sugerido**: Al construir `/api/clients/[id]/questionnaire` y `/api/clients/[id]/materiality`, llamar `logChange()`.
- **Esfuerzo**: 30min por endpoint

### 🟡 D-07 — Export PDF del cliente no existe
- **Descripción**: No hay forma de exportar el contexto + servicios + cuestionario + materialidad de un cliente en un PDF entregable al cliente final.
- **Fix sugerido**: Integrar `@react-pdf/renderer` o ruta `/api/clients/[id]/export-pdf` con plantilla.
- **Esfuerzo**: 1-2 días

### 🟢 D-08 — Stone vs slate: tokens mezclados
- **Descripción**: Algunos componentes legacy (`ClientForm`, `ChatWindow`) usan `stone-*` mientras los nuevos (`ClientTabs`) usan `slate-*`. CLAUDE.md decreta `slate-*` como canónico.
- **Fix sugerido**: Pase global `stone-` → `slate-` en componentes B2B.
- **Esfuerzo**: 2-3h

### 🟢 D-09 — `ConfirmDialog` deprecado activo en CatalogsManager y PromptsManager
- **Descripción**: `components/ConfirmDialog.tsx` es wrapper anterior; el nuevo estándar es `components/ui/ConfirmModal.tsx`.
- **Fix sugerido**: Migrar `CatalogsManager` y `PromptsManager` a `ConfirmModal`.
- **Esfuerzo**: 1h

### 🟢 D-10 — Sin trazabilidad Chat → Cuestionario
- **Descripción**: Los mensajes del chat IA no linkean a campos específicos del cuestionario.
- **Fix sugerido**: Cuando exista cuestionario, `buildClientContext` debe incluir field IDs; el chat puede citar `[ver campo X]`.
- **Esfuerzo**: 4-6h (después de Fase 2)

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
| R-10 | Chat sin Copy/Thumbs/Export/Retry (S-Peak parity) | may-2026 (en mockup eliminado; pendiente portear a `ChatWindow` real) |

---

## Hito: Consolidación de mockup → app real (may-2026)

El mockup `app/dev/app-preview/AppShell.tsx` fue eliminado. Las rutas reales (`/chat`, `/clientes`, `/clientes/[id]`, `/configuracion`) son ahora el único frente productivo en `app.responsable.net`. El diseño corporate B2B se mantiene en:
- `ClientTabs` (header KPI + 4 tabs con badges)
- `ClientsList` (tabla con headers uppercase tracking-widest)
- Tabs placeholder "Próximamente" para Cuestionario y Materialidad

**Próximas fases**:
- Fase 2 (sprint): Cuestionario funcional → resuelve D-01
- Fase 3 (sprint): Matriz de Materialidad funcional → resuelve D-02
- Después: D-03, D-07, D-10 (chat con contexto, export PDF, trazabilidad)

---

*Última auditoría: may-2026 (consolidación). Próxima revisión: ver tareas programadas en `MEMORY.md`.*
