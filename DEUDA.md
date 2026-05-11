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

### Bloque D-158–D-162 — Hallazgos auditoría sesión 27 (2026-05-10)

### ~~🟡 D-158 — `@anthropic-ai/sdk` 16 minor versions atrás (0.79.0 → 0.95.1)~~ ✅ RESUELTO (sesión 28)
- Bump aplicado sin breaking changes: TS 0, ESLint 0/0, 318/318 tests verde.
- Bonus: 8 `cache_control: { type: "ephemeral" } as any` eliminados — SDK 0.95 expone `CacheControlEphemeral` como type estable. `Batch result` ahora es discriminated union (`type: 'succeeded' | 'errored'`), `usage.cache_creation_input_tokens` + `cache_read_input_tokens` son campos estables.
- Verificación: `dist.tarball 0.95.1` instalado, `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` confirma types.

### ~~🟡 D-159 — POST/PATCH sin Zod schema validation en 8 endpoints~~ ✅ RESUELTO (sesión 27)
- chat-sessions POST + PATCH, client-services/[id] PATCH, extract-profile POST, materiality POST → Zod `.safeParse()` añadido. dm-resumen POST sin body (false positive). dm-validacion PATCH ya filtraba allowed manual (mitigado pero ahora también con Zod si se requiere). freeze-baseline solo query string (false positive).

### ~~🟢 D-160 — `auth/send-code` y `auth/login-code` sin Zod parse~~ ✅ RESUELTO (sesión 27)
- `SendCodeSchema` + `LoginCodeSchema` añadidos. Validación email/code antes de proceder.

### 🟢 D-161 — `DocumentsTab.tsx` 82KB / 1879L (creció vs s25)
- Subset D-153. Refactor con D-150 mismo sprint.

### ~~🟢 D-162 — Routes monolitos backend: Anthropic Batch result handler duplicado en 3 routes~~ ✅ RESUELTO (sesión 27)
- Helper `lib/ai/batch-result.ts` `extractBatchResult<T>(anthropic, batchId, schema, contextLog)` extraído. dm-benchmark, dm-iros, dm-report ahora usan helper único. Reducción ~90 LOC duplicadas. Imports `extractJsonObject` removidos donde ya no se usa.

---

### Bloque D-155–D-157 — Hallazgos auditoría sesión 26 (2026-05-10 post-cleanup s25)

### ~~🟡 D-155 — 5 mutaciones DM-IA sin audit log~~ ✅ RESUELTO (sesión 26)
- **Antes**: dm-validacion PATCH (decisiones IRO + acta junta), dm-config PATCH (horizontes), dm-nis POST + PATCH (Núcleos Impacto/Sostenibilidad), dm-resumen PATCH + POST (resúmenes ejecutivos), dm-benchmark PATCH (modificar empresas/decisiones) — sin `logChange()`. Trazabilidad rota para entregable consultoría auditado externo.
- **Fix sesión 26**: `logChange()` agregado en 7 mutation handlers con entityType nuevos (`dm_validacion`, `dm_config`, `dm_nis`, `dm_resumen`, `dm_benchmark_company`). Antes/después serializados. AuditEntityType ya tenía los tipos definidos.
- **Patrón canónico**: CLAUDE.md "Audit log de mutaciones admin" extendido a mutaciones consultor sobre entregables auditados (DM-IA). Aplica a app-responsable + replicable.

### ~~🟢 D-156 — `console.log` debug raw AI response en dm-benchmark/route.ts:419~~ ✅ RESUELTO (sesión 26)
- 800 chars de respuesta IA loggeados en cada call propose → Vercel logs verbose + posible info leak. Eliminado.

### 🟢 D-157 — `ClientForm.tsx` 686 LOC + `ClientsList.tsx` 618 LOC
- Componentes grandes pero no monolitos críticos como D-150. Diferido: refactor cuando se toque D-150 (mismo sprint).

---

### Bloque D-148–D-154 — Hallazgos auditoría sesión 25 (2026-05-10)

### ~~🔴 D-148 — 7 ESLint errors react-hooks (rules-of-hooks + TDZ + setState in effect)~~ ✅ RESUELTO (sesión 25)
- `QuestionnaireTab.tsx:452` useEffect después de early return → movido ANTES del early return + comentado patrón hoisted para aiFillAll/docFill (function declarations)
- `ClientTabs.tsx:134/158/189` setShowStripDropdown accessed before declared + setState in effect → movido `useState` + `useRef` antes de useEffects + eslint-disable con justificación en sync URL→state y restauración localStorage (one-shot)
- `DoubleMaterialidadTab.tsx:2575` navigateTo (setState) en effect → eslint-disable con justificación (smart jump único, ref didSmartJumpRef previene loop)

### ~~🟡 D-149 — Mockups `/dev/` 235KB no eliminados pese a CLAUDE.md~~ ✅ RESUELTO (sesión 25)
- Decisión: mockups SIGUEN ACTIVOS como playground dev (todos modificados esta semana). CLAUDE.md actualizado para reflejar realidad — sección renombrada "Mockups `/dev/*` — playground dev" + tabla de propósito por carpeta + regla de cleanup.
- Middleware `lib/supabase/middleware.ts:60-61` bloquea `/dev/*` en producción ✓

### 🟡 D-150 — `DoubleMaterialidadTab.tsx` monolito (PARCIALMENTE RESUELTO sesión 28: 2988L → 1911L = -36%)
- **Aplicado sesión 28**: 5 secciones extraídas a archivos propios:
  - `HorizontesConfig.tsx` (121L) — config horizontes temporales
  - `NisSection.tsx` (244L) — Etapa 4 NIS/IBSO + helpers ESTADO/CALIDAD/CATEGORIA
  - `ContextoSection.tsx` (103L) — Etapa 1 KPI cards + progress bar
  - `ReporteSection.tsx` (217L) — Etapa 5 generar/descargar/regenerar PDF
  - `IroSection.tsx` (411L) — Etapa 3 IROs cliente + ScorePicker + prioridad helper + SCORE_DIM*_LABEL/TOOLTIP/TIPO_BADGE/CADENA_LABEL
  - `ExpandableCell.tsx` (26L) — celda truncada compartida
  - `catalog-lookup.ts` (15L) — `catalogLabel(category, value)` helper
- **Pendiente**: `BenchmarkSection.tsx` 775L sigue inline en main. Refactor con state SWR complejo (propose/compare/add_manual/remove + polling batch + modal selección). Requiere análisis profundo de `useSWR` patterns + smoke test cliente piloto Nuvoil/Altamira para no romper UI benchmark.
- **Pre-requisitos extraer BenchmarkSection**: branch dedicado · revisión 2 desarrolladores · smoke test propose+compare+add_manual+remove+polling con cliente real.
- **Esfuerzo restante**: 1 sprint (4h refactor + 2h smoke test).

### 🟡 D-151 — 35 ocurrencias `as any` / `: any` sin `eslint-disable` justificado
- **Descripción**: reduce safety TS. No urgente, fix incremental por archivo.
- **Esfuerzo**: gradual (5min por ocurrencia)

### ~~🟢 D-152 — 3 tests `apply-sql-safety.test.ts` timeout 5s (OneDrive Files-On-Demand)~~ ✅ RESUELTO (sesión 25)
- 3 tests (`permite ALTER TABLE ADD COLUMN IF NOT EXISTS`, `permite CREATE TABLE IF NOT EXISTS`, `permite COMMENT ON COLUMN`) ahora con `{ timeout: 30000 }` por test. Razón: spawn de helper Node.js sobre path con espacios + OneDrive puede tardar 5-15s la primera vez.

### 🟢 D-153 — `DocumentsTab.tsx` 74KB + `ServiceGantt.tsx` 55KB monolitos secundarios
- Mismo patrón D-150 menos urgente. Tomar después de D-150 para validar el approach.

### ~~🟢 D-154 — 7 ESLint warnings unused vars~~ ✅ RESUELTO (sesión 25)
- `completeness`, `serviceLabels`, `visibleServices`, `stripPinned`, `reportUrls`, `decisions×2` → prefix `_` o destructuring `[, setX]` o `useMemo`. ESLint final: 0 errors, 0 warnings.

---

### Bloque D-144–D-147 — Hallazgos auditoría sesión 22 (may-2026)

### ~~🔴 D-144 — SSRF guard duplicado, sin cobertura IPv4-mapped IPv6~~ ✅ RESUELTO (sesión 22 + 23)
- `extract-profile.ts` usaba guard custom más débil que `isPublicHttpUrl`. `::ffff:192.168.x.x` bypasaba `isPrivateIPv4()`. Fix sesión 22: ssrf.ts + extract-profile.ts unificados.
- Fix adicional sesión 23: check `::ffff:*` en ssrf.ts era incorrecto — Node.js WHATWG normaliza `[::ffff:192.168.1.1]` → `::ffff:c0a8:101` (hex), regex dotted-decimal nunca matcheaba. Fix: conversión hex→decimal. Descubierto por tests de regresión.

### ~~🟡 D-145 — chat_requests sin índice compuesto para rate limit extract-profile~~ ✅ RESUELTO (sesión 24)
- Migración `0070_chat_requests_ratelimit_index.sql` aplicada. `idx_chat_requests_ratelimit ON chat_requests (user_email, role, created_at DESC)`.

### ~~🟢 D-146 — extract-profile no registraba en logAiCall~~ ✅ RESUELTO
- Tokens propagados desde `resp.usage` → `ProfileExtractResult` → route → `logAiCall`. Sesión 22.

### ~~🟢 D-147 — Cache in-memory de extract-profile se pierde en cada deploy~~ ✅ ACEPTADO MVP DEFINITIVO (sesión 27)
- **Descripción**: `const cache = new Map()` en `lib/ai/extract-profile.ts`. TTL 30min, 200 entradas, 8 usuarios.
- **Decisión sesión 27**: NO migrar a DB. Trade-off: round-trip Supabase por lookup vs persistencia entre deploys. Para 8 usuarios + cache TTL corto, perf > persistencia. Re-evaluar cuando users >50 o issue real reportado.

---

### Bloque D-89–D-98 — Hallazgos design critique may-2026 (sesión 2)

### ~~🔴 D-89 — Configuración abre en blanco sin contenido default~~ ✅ VERIFICADO RESUELTO
- `configuracion/page.tsx` ya tiene `redirect("/configuracion/usuarios")`.

### ~~🔴 D-90 — ACCESO RÁPIDO del sidebar no navega al hacer clic~~ ✅ VERIFICADO RESUELTO
- `Sidebar.tsx`: items envueltos en `<Link href={"/clientes/${p.client_id}"}>`; sección oculta dentro de `/clientes/[id]`.

### ~~🔴 D-91 — Roles del Chat IA sin descripción permanente~~ ✅ VERIFICADO RESUELTO
- `chat-types.ts` ROLES[].desc tiene strings descriptivos. `ChatWindow.tsx` los renderiza debajo del label (línea 634-636).

### ~~🟡 D-92 — Chat IA sin default explícito para rol activo~~ ✅ VERIFICADO RESUELTO
- Aurora tiene dot activo visible + fondo marcado. Verificado en `ChatWindow.tsx`.

### ~~🟡 D-93 — Cronograma toolbar mezcla acciones y vistas~~ ✅ VERIFICADO RESUELTO
- Separador `div.w-px` ya existe entre botones de acción y `ViewToggle`. Verificado en `ClientCronogramaTab.tsx`.

### ~~🟡 D-94 — Equipo: 4 filtros siempre visibles sin progressive disclosure~~ ✅ RESUELTO
- STATUS chips siempre visibles. Consultor/Proyecto/Rango colapsados en "Filtrar ▼" con badge. `EquipoFilters.tsx` + `useState(showAdvanced)`.

### ~~🟡 D-95 — Cuestionario: badge "✓ validado" en todos los campos de secciones completas~~ ✅ RESUELTO
- Prop `sectionComplete` en `FieldRow`. Badge se oculta cuando la sección está al 100% (`!sectionComplete`). `QuestionnaireTab.tsx`.

### ~~🟡 D-96 — "Quitar validación" visible aunque stats.validated === 0~~ ✅ VERIFICADO RESUELTO
- `MaterialityTab.tsx` solo muestra "Quitar validación" cuando `stats.validated === stats.total && stats.total > 0`. Si validated=0, muestra "Validar todos".

### ~~🟡 D-97 — Cuentas Demo mezcladas con consultores reales en Equipo~~ ✅ RESUELTO
- Migración `0044`: `is_test_account boolean NOT NULL DEFAULT false`. Badge "TEST" en `UsersManager`. Excluidas por default en `/api/team/occupancy` + toggle "Mostrar cuentas de prueba" en `EquipoView`.

### ~~🟢 D-98 — Tablas Equipo y Consultores sin zebra stripe~~ ✅ VERIFICADO RESUELTO
- `TeamTab.tsx` línea 156: `className="even:bg-slate-50/60 hover:bg-brand-primary-light/30"`.

---

### ~~🔴 D-80 — Home = Chat IA vacío, flujo mental invertido~~ ✅ RESUELTO
- Redirect middleware a `/clientes` aplicado. "Chat IA" en nav actualizado.

### ~~🔴 D-81 — Roles del chat IA sin affordance de interactividad~~ ✅ VERIFICADO RESUELTO
- Chat role stepper tiene hover states, active ring, colored avatar, y descripción siempre visible. Verificado en código de `ChatWindow.tsx`.

### ~~🟡 D-82 — 3 niveles de tabs en Configuración~~ ✅ RESUELTO
- `CatalogsManager`: eliminados 2 niveles de tabs horizontales. Reemplazados por panel izquierdo vertical con group headers SAP Fiori. 2 niveles: sidebar nav principal + lista en panel izquierdo.

### ~~🟡 D-83 — "Equipo" en nav global vs tab de cliente — mismo label, scope opuesto~~ ✅ RESUELTO
- Tab del cliente renombrado a "CONSULTORES". Nav global sigue siendo "Equipo".

### ~~🟡 D-84 — Sugerencias de chat genéricas cuando hay cliente seleccionado~~ ✅ RESUELTO
- `ChatEmptyState.tsx`: `getContextualStarters()` genera sugerencias interpolando el nombre del cliente por rol (Aurora/Rebeca/Elena/Valeria). Implementado en sprint anterior.

### Bloque D-121–D-124 — Hallazgos auditoría sesión 18 (may-2026)

### ~~🔴 D-121 — RBAC bypass en export-pdf y export-cronograma-pdf~~ ✅ RESUELTO
- `requireUser()` → `requireConsultorForClient(id)` en ambas rutas. Fix aplicado en sesión 18.

### ~~🟡 D-122 — dm-report POST sin rate limit (Elena/Opus)~~ ✅ RESUELTO
- Rate limit DB cross-instancias 3 calls/5min añadido al inicio del POST handler. Mismo patrón que dm-benchmark (D-111). Sesión 18.

### ~~🟡 D-123 — research-reports POST sin rate limit~~ ✅ RESUELTO
- Rate limit DB 5 calls/5min añadido. Aurora + web_search × 3, menor costo que Opus pero acumulable. Sesión 18.

### ~~🟢 D-124 — audit-health y usage.ts: cost estimate no era model-aware para Opus~~ ✅ RESUELTO
- Ambos archivos ahora usan precios por modelo: Haiku $0.25/$1.25, Sonnet $3/$15, Opus $5/$25. Sesión 18.

---

### Bloque D-125–D-129 — Hallazgos auditoría sesión 19 (may-2026)

### ~~🟡 D-127 — PATCH /api/clients/[id] logChange sin snapshot `before`~~ ✅ RESUELTO
- `getClient(id)` antes de `updateClientRow`. Snapshot `before` proyectado en mismos campos que `after`. Sesión 19.

### ~~🟡 D-129 — CSP `unsafe-eval` en producción~~ ✅ RESUELTO
- `'unsafe-eval'` eliminado de `script-src` en `next.config.ts`. Solo `'unsafe-inline'` (necesario para Next.js App Router). Sesión 19.

### ~~🟢 D-125 — ConsultorSwimlane.tsx dead code (355 líneas)~~ ✅ RESUELTO
- Archivo eliminado. 0 consumidores confirmados. Sesión 19.

### ~~🟢 D-126 — mockup-timeline-swimlane.html en raíz del repo~~ ✅ RESUELTO
- Archivo eliminado (untracked — no requería git rm). Sesión 19.

### ~~🟢 D-128 — POST /api/clients sin logChange~~ ✅ RESUELTO
- `logChange` importado y llamado tras `createClientRow` con `action: "create"`. Sesión 19.

---

### ~~🟡 D-85 — "MIS PROYECTOS" en sidebar duplica acceso ya dado por nav "Clientes"~~ ✅ RESUELTO
- Sección "Acceso rápido" eliminada de `Sidebar.tsx`. `useSWR`, `projectsFetcher`, `ProjectsResponse`, `ConsultorProject` — todo dead code removido. Sesión 18.

### ~~🟡 D-86 — Cronograma header redundante dentro del tab~~ ✅ VERIFICADO RESUELTO
- `ClientCronogramaTab.tsx` — no hay h2 `CRONOGRAMA DEL CLIENTE`. Verificado sesión 17.

### ~~🟢 D-87 — Copy inconsistente: "IA llena 7 pasos" vs "PASO 1 DE 9"~~ ✅ VERIFICADO RESUELTO
- `AiBulkBanner.tsx:42` — copy dinámico `{aiCapableCount} de {totalSteps}`. Verificado sesión 17.

### ~~🟢 D-88 — "ADMIN" label redundante en headers de Equipo y Configuración~~ ✅ VERIFICADO RESUELTO
- `equipo/page.tsx:12`, `configuracion/layout.tsx:26` — label "ADMIN" eliminado. Verificado sesión 17.

---

### Bloque D-109–D-115 — Hallazgos auditoría sesión 17 (may-2026)

### ~~🟡 D-109 — Sonnet fallback stale `claude-sonnet-4-20250514` en 5 lugares~~ ✅ RESUELTO
- `lib/ai/models.ts` (aurora+rebeca), `lib/ai/extract-test.ts`, `env.example` — actualizados a `claude-sonnet-4-6`. `dm-benchmark/route.ts` y `dm-report/route.ts` resueltos via D-110 (usan `getModelConfig()`). Sesión 17.

### ~~🟡 D-110 — `dm-benchmark` y `dm-report` hardcodean model lookup propio~~ ✅ RESUELTO
- Ambas rutas ahora importan `getModelConfig` de `lib/ai/models.ts`. `dm-benchmark` usa `getModelConfig("aurora")` para propose y `getModelConfig("elena")` para compare. `dm-report` usa `getModelConfig("elena")`. Sesión 17.

### ~~🟡 D-111 — `dm-benchmark` POST sin rate limit~~ ✅ RESUELTO
- Rate limit DB 3 calls/5min por usuario añadido al inicio del handler POST. Mismo patrón que `ai-fill` pero ventana más estricta (web_search + Opus ~$0.50/call). `dm-benchmark/route.ts`. Sesión 17.

### ~~🟡 D-112 — `logAiCall` sin `cacheCreationTokens`/`cacheReadTokens` en dm-benchmark y dm-report~~ ✅ RESUELTO
- 4 calls en `dm-benchmark` + 2 en `dm-report` actualizados para capturar y registrar `cache_creation_input_tokens` y `cache_read_input_tokens`. Dashboard uso-IA ahora reporta costos completos. Sesión 17.

### ~~🟡 D-113 — `ai-fill` llama `getClient(id)` dos veces~~ ✅ RESUELTO
- Un solo `getClient(id)` al inicio del handler, reutilizado en guard `only_double_materialidad` y en construcción de contexto. `wizard/[stepKey]/ai-fill/route.ts`. Sesión 17.

### ~~🟢 D-114 — Middleware: cron bypass ocurre después de `auth.getUser()`~~ ✅ RESUELTO
- Bloque CRON_SECRET movido antes de `createServerClient`/`auth.getUser()`. Crons ya no pagan round-trip Supabase innecesario. `lib/supabase/middleware.ts`. Sesión 17.

### ~~🟢 D-115 — DEUDA.md stale: D-86/D-87/D-88 resueltos pero no tachados~~ ✅ RESUELTO
- Actualizado en sesión 17 (ver arriba).

---

### Bloque D-99–D-106 — Hallazgos auditoría sesión 15 (may-2026)

### ~~🟡 D-99 — Type coercions circulares en parsers.ts~~ ✅ RESUELTO
- `mammoth.convertToHtml({ buffer as unknown as Buffer })` circular → eliminado (ya era Buffer). `wb.xlsx.load(buffer as unknown as ArrayBuffer)` → `buffer.buffer.slice(byteOffset, byteOffset+byteLength)` correcto.

### ~~🟡 D-100 — kind validation manual en documents route~~ ✅ RESUELTO
- `lib/documents/types.ts` creado con `DOCUMENT_KIND_SCHEMA = z.enum([...])`. `documents/route.ts` usa `DOCUMENT_KIND_SCHEMA.safeParse()`.

### ~~🟢 D-101 — DocumentsTab useSWR cast innecesario~~ ✅ RESUELTO
- `fetcher as unknown as (url: string) => Promise<...>` → `fetcher` (SWR infiere el tipo del generic). `DocumentsTab.tsx`.

### ~~🟡 D-102 — ingest-report sin validación de magic bytes~~ ✅ RESUELTO
- Añadida verificación de primeros 8 bytes (`%PDF`, `PK`) en `ingest-report/route.ts`. Defense in depth contra MIME spoofing.

### ~~🟢 D-103 — Comentario faltante sobre `redirect: "follow"` SSRF risk~~ ✅ RESUELTO
- Comentario añadido en `ingest-report/route.ts` (el archivo real con el fetch externo, no research-reports). Explica riesgo post-redirect y lo marca como aceptado para piloto.

### ~~🟡 D-105 — extractJsonObject DRY — 3 copias idénticas~~ ✅ RESUELTO
- Extraído a `lib/ai/extract-json.ts`. 3 rutas (`ai-fill`, `doc-fill`, `research-reports`) importan desde el módulo compartido.

### ~~🟢 D-106 — RBAC ownership: consultor ve clientes de otros consultores~~ ✅ RESUELTO
- `lib/auth.ts`: función `requireConsultorForClient(clientId)` verifica `client_consultors` en DB. Admins y `dev@localhost` exentos.
- Aplicado a 9 endpoints: questionnaire, wizard/ai-fill, wizard/doc-fill, research-reports, documents, documents/[docId], ingest-report, materiality. Cada endpoint extrae params antes de llamar auth.

---

### ⏸ D-04 — Metodología ResponSable: pasos no definidos (NO CONTABILIZAR — bloqueo negocio)
- **Estado sesión 28 (2026-05-10)**: por instrucción del usuario, NO se contabiliza en scores de deuda ni aparece en próximos audits hasta que el equipo metodología defina los pasos.
- **Cuando se defina**: agregar 5ta KPI card en `ClientTabs` (~30min código). Re-abrir como ticket de feature, no deuda.

---

### Bloque D-163–D-164 — Bugs preexistentes detectados sesión 28 (cache stale TS)

### ~~🟡 D-163 — `AuditEntityType` faltaba `questionnaire_snapshot`~~ ✅ RESUELTO (sesión 28)
- TS error: `entityType: "questionnaire_snapshot"` not assignable. Detectado al limpiar cache TS post SDK bump.
- Fix: agregado a union en `lib/audit-log.ts`.

### ~~🟡 D-164 — `AiBulkBanner` consumer en `QuestionnaireTab` desactualizado~~ ✅ RESUELTO (sesión 28)
- AiBulkBanner refactorizado a `onFillScope` con 3 opciones (empty/non_validated/all) + counts por scope. QuestionnaireTab seguía pasando `someStepHasResponses`/`onFillAll` (props viejas).
- Fix: `useMemo` calcula `emptyFieldCount/nonValidatedFieldCount/totalFieldCount` recorriendo solo pasos `ai_can_fill`. `handleFillScope(scope)` mapea scope → `setConfirmBulkFill` o `aiFillAll()` directo.


---

## Deuda resuelta (sesión 14 — may-2026, D-99–D-108)

| ID | Estado | Descripción | Resuelto |
|----|--------|-------------|---------|
| D-99 | ✅ | CARGA: mini barra de utilización (0–6 max recomendado) | may-2026 |
| D-100 | ✅ | Divergencia retrasadas Por Consultor vs Por Proyecto: tooltip explicativo | may-2026 |
| D-101 | ✅ | 5 tabs vista → 2 primary (texto+icono) + 3 icon-only con tooltip | may-2026 |
| D-102 | ✅ | Instrucción textual permanente bajo tabs eliminada | may-2026 |
| D-103 | ✅ | "Real: — → —" oculto cuando sin fechas reales | may-2026 |
| D-104 | ✅ | Assignee @email → nombre humanizado | may-2026 |
| D-105 | ✅ | Unificar "Atrasadas" / "retrasadas" → "Retrasadas" | may-2026 |
| D-106 | ✅ | ViewToggle LISTA/GANTT padding aumentado a min 32px | may-2026 |
| D-107 | ✅ | Chips de status en Por Proyecto son botones que aplican filtro global | may-2026 |
| D-108 | ✅ | Quick reassign inline en actividades de Por Proyecto | may-2026 |

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

## Deuda resuelta (sesión 16 — may-2026, sprint A+B+C)

| ID | Descripción | Resuelto |
|----|-------------|---------|
| D-89 | Configuración redirect → usuarios (ya estaba) | may-2026 |
| D-90 | Sidebar acceso rápido links (ya estaba con `<Link>`) | may-2026 |
| D-91 | Roles chat desc visible (ROLES[].desc ya renderizado) | may-2026 |
| D-96 | Quitar validación oculto cuando validated=0 (ya estaba correcto) | may-2026 |
| D-98 | Zebra stripe TeamTab `even:bg-slate-50/60` (ya estaba) | may-2026 |
| D-103 | Comentario SSRF `redirect:"follow"` en ingest-report | may-2026 |
| D-106 | RBAC `requireConsultorForClient` en 9 endpoints | may-2026 |
| Sprint B tests | 10 tests extractJsonObject + 3 DOCUMENT_KIND_SCHEMA + 2 auth dev-mode | may-2026 |
| Sprint C SWR | `DashboardSWRProvider` retry exponencial global (3 retries, backoff 1.5s–30s) | may-2026 |
| Sprint C cron | `daily-qa` envía email a admin cuando detecta fallos (Resend, ADMIN_ALERT_EMAIL) | may-2026 |

---

*Última auditoría: may-2026 sesión 18 — D-85/D-121/D-122/D-123/D-124 todos resueltos. Ítem activo: D-04 (metodología — decisión de negocio). Score global 8.5/10. Próxima revisión: ver tareas programadas en `MEMORY.md`.*
