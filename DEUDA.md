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

### 🔴 D-01 — Dev preview requiere login en producción
- **Descripción**: `/dev/app-preview` está protegido por el middleware de auth (líneas 63-68 de `lib/supabase/middleware.ts`). En producción (`app.responsable.net/dev/app-preview`) redirige a login.
- **Impacto**: El mockup desplegado no es accesible sin cuenta real. El equipo no puede revisar el preview sin credenciales.
- **Fix sugerido**: Agregar excepción en middleware para `NODE_ENV !== 'production'` O crear ruta pública alternativa sin `/dev/` prefix.
- **Esfuerzo**: 1h

### 🔴 D-02 — Chat IA mockup no conecta a backend real
- **Descripción**: El tab "Chat IA" en `ClientTabsView` muestra un preview estático con `INITIAL_MSGS`. No usa `ChatSection` real ni llama a `/api/chat`.
- **Impacto**: El mockup no refleja la experiencia real del chat con Aurora/Rebeca/Elena/Valeria.
- **Fix sugerido**: Pasar `clientId` como prop a `ClientTabsView` y renderizar `<ChatSection clientId={...} />` en el tab "chat".
- **Esfuerzo**: 2-3h

### 🟡 D-03 — Cuestionario solo lectura
- **Descripción**: Los campos del Cuestionario en `ClientTabsView` son read-only. El consultor no puede editar valores desde la vista cliente.
- **Impacto**: Flujo incompleto; el consultor tiene que salir a otra pantalla para editar.
- **Fix sugerido**: Agregar campos `<input>` / `<select>` con estado local y botón "Guardar sección".
- **Esfuerzo**: 3-4h

### 🟡 D-04 — Export PDF de Materialidad es placeholder
- **Descripción**: El botón "Exportar PDF" en la pestaña Materialidad no genera PDF real.
- **Fix sugerido**: Integrar `@react-pdf/renderer` o llamar a una ruta `/api/export/matrix` que devuelva PDF.
- **Esfuerzo**: 4-6h

### 🟡 D-05 — Metodología ResponSable: pasos inventados
- **Descripción**: El stepper "Comprender / Diseñar / Optimizar / Utilizar / Medir" fue inventado para el mockup. No corresponde a la metodología real.
- **Impacto**: Si se muestra a clientes, genera expectativas falsas sobre el proceso.
- **Fix sugerido**: Equipo debe definir los 5 pasos reales. Mientras tanto, mostrar "Por definir · Placeholder" (ya implementado en KPI card).
- **Responsable**: Equipo metodología ResponSable
- **Esfuerzo**: Decisión de negocio, luego 30min de código

### 🟡 D-06 — Shape encoding: triángulo con CSS puro
- **Descripción**: El shape "▲ En seguimiento" usa el carácter Unicode `▲` en el dot del índice. En la matriz visual, se renderiza igual que un círculo. Falta diferenciar visualmente con CSS `clip-path: polygon(...)` o SVG shape real.
- **Impacto**: Parcialmente daltónico-accesible; el shape encoding no está completo para el punto ▲ en la matriz.
- **Esfuerzo**: 2h

### 🟡 D-07 — No hay trazabilidad entre Chat IA y Cuestionario
- **Descripción**: El contexto del cliente que se pasa al chat IA (Aurora/Rebeca/Elena/Valeria) no referencia campos específicos del Cuestionario. No hay drill-down "Ver campo fuente".
- **Fix sugerido**: `buildClientContext` debería incluir IDs de campo; popover de tema materialidad debería linkear al campo del cuestionario.
- **Esfuerzo**: 4-6h

### 🟡 D-08 — Sin paginación en índice de clientes
- **Descripción**: La lista de clientes en el panel izquierdo de `AppShell` es estática (mockup). Sin paginación ni búsqueda real contra Supabase.
- **Fix sugerido**: Integrar SWR + `/api/clients` con búsqueda server-side.
- **Esfuerzo**: 3-4h

### 🟡 D-09 — Audit log no cubre mutaciones del Cuestionario
- **Descripción**: `logChange()` cubre endpoints admin pero no las respuestas del cuestionario por consultor.
- **Fix sugerido**: Al guardar respuesta de cuestionario, llamar `logChange()` con `entityType: "questionnaire_field"`.
- **Esfuerzo**: 1-2h

### 🟢 D-10 — Thumbs up/down sin backend en Chat mockup
- **Descripción**: El rating de mensajes IA (calificar) solo actualiza estado local; no persiste en Supabase.
- **Fix sugerido**: Tabla `chat_ratings(msg_id, rating, actor_email, created_at)` + endpoint `/api/chat/rate`.
- **Esfuerzo**: 2h

### 🟢 D-11 — Filtro de cuadrante no persiste al cambiar de tab
- **Descripción**: `filterQuadrant` es estado local de `ClientTabsView`. Si el consultor va a Cuestionario y vuelve a Materialidad, el filtro se resetea.
- **Fix sugerido**: Elevar estado a `AppShell` o usar `sessionStorage`.
- **Esfuerzo**: 30min

### 🟢 D-12 — Sin feedback vacío en búsqueda de clientes
- **Descripción**: Si el filtro de búsqueda no encuentra clientes, no hay empty state visual.
- **Fix sugerido**: Agregar `<EmptyState>` con mensaje "Sin clientes que coincidan con la búsqueda".
- **Esfuerzo**: 30min

### 🟢 D-13 — `ConfirmDialog` deprecado activo en CatalogsManager y PromptsManager
- **Descripción**: `components/ConfirmDialog.tsx` es wrapper anterior; el nuevo estándar es `components/ui/ConfirmModal.tsx`. Los dos managers usan la versión legacy.
- **Fix sugerido**: Migrar `CatalogsManager` y `PromptsManager` a `ConfirmModal`.
- **Esfuerzo**: 1h

---

## Deuda resuelta

| ID | Descripción | Resuelto |
|----|-------------|---------|
| R-01 | Matriz de materialidad sin patrón BCG — solo barra de progreso | may-2026 |
| R-02 | Diseño SaaS-startup en lugar de B2B corporativo | may-2026 |
| R-03 | Sin breadcrumb en vista cliente (sin retorno a lista) | may-2026 |
| R-04 | Tabs sin badges de progreso | may-2026 |
| R-05 | Sin narrative chip en matriz | may-2026 |
| R-06 | Sin filtro por cuadrante en matriz | may-2026 |
| R-07 | Sin shape encoding para daltonismo | may-2026 |
| R-08 | Emoji en iconos de sección (desalineación en overlays) | may-2026 |
| R-09 | Cuestionario tab completamente vacío | may-2026 |
| R-10 | Chat IA tab sin contexto del cliente | may-2026 |
| R-11 | `.gitignore` no excluía `.claude/` | may-2026 |

---

*Última auditoría: may-2026. Próxima revisión: ver tareas programadas en `MEMORY.md`.*
