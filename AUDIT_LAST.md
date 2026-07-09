# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-07-09 (audit-app UNIFICADO Fable — FORMA en vivo + FONDO code-read + PUENTES + SEGURIDAD adversarial con refutación)
**Calificación global:** 6.5 / 10 (audit adversarial de flujos completos + seguridad; el 9.9 previo medía calidad de código incremental, no cruces/flujos/seguridad)

## Auditoría 2026-07-09 — hallazgos vivos (post-refutación)

Método: captura en vivo Chrome (admin nblondel, solo lectura sobre clientes DEMO + Altamira) + 2 revisores seguridad Opus + 2 escépticos refutando + 2 revisores fondo Opus code-read. Gates: check:design 0 err/7 warn W3 · tsc limpio · tests 353/357 (4 fallan por SUPABASE_SERVICE_ROLE_KEY ausente en entorno local, no bug de app).

### 🔴 Críticos (bloquean entregable o decisión)
- **C1 FONDO — Matriz vs Resumen se contradicen.** `DoubleMaterialidadTab.tsx:437-446` clasifica cuadrante con `score>=2`; `MatrizDM.tsx:79-93` con eje>=5 (equiv `score>=3`). Mismo IRO (impacto=2,financiero=2) sale "doble material" en KPI cards y "en seguimiento" en la gráfica. Fix: `classifyQuadrant()` única en `lib/dm/`, decidir umbral con metodología.
- **C2 FONDO — "Generar reporte" no hace nada.** Con `SHOW_BENCHMARK_STAGES=false`, `ReporteSection.tsx:188` hace `if(!latestResult) return` (silencioso) y `dm-report/route.ts:305-315` exige benchmark done. La etapa final (entregable) es inalcanzable. Fix: desacoplar dm-report del benchmark cuando el flag está oculto, o bloquear la etapa con lockedReason claro.
- **H1 FONDO — Actividad iniciada+vencida no cuenta como retrasada.** `lib/stages.ts:69-72`: `in_progress` gana antes de evaluar `delayed`. Tabla Equipo la muestra "En curso"/0 retrasadas, pero `cron/delayed-activities` SÍ la manda en el correo → tabla y correo dan cifras distintas para "retrasada". Fix: `delayed` domina sobre `in_progress` cuando `today>planned_end`.

### 🟠 Altos / seguridad
- **SEG — IDOR documentos cross-cliente (P2).** `documents/route.ts:154-206` Path B confía en `storagePath` del body sin validar prefijo `${id}/`; `processStoredDocument` descarga con service-role (salta RLS). Explotable solo conociendo el UUID del path de otro cliente (NO se filtra por el GET — mapeo explícito de campos, path queda fuera). Fix 1 línea: `if(!storagePath.startsWith(`${id}/`)) return 400`. Aplica a rama ZIP y a `processStoredDocument` (defensa profundidad).
- **SEG — IDOR rol cliente latente (7 endpoints).** `ai-costs`, `services` (GET+POST), `clients/[id]` GET, `stages` GET, `engagements` GET/POST, `consultors` GET usan `requireUser` (no discrimina rol) + service-role. Hoy sin cliente externo activo (solo 3 cuentas +altamira internas). GATE OBLIGATORIO antes de onboardear 1er cliente externo: cambiar a `requireConsultorForClient`.
- **SEG — Job `ingest-one-company` fail-open.** `jobs/ingest-one-company/route.ts:42-44` procesa sin verificar firma si faltan QSTASH keys. Refutado como crítico: keys presentes en prod → código muerto ahí. Hardening: copiar patrón de `reparse-document` (401 si faltan keys). Asimetría real.
- **SEG — Secrets de prod en `.env.local` dentro de OneDrive sincronizado.** service_role, ANTHROPIC, RESEND, QSTASH, GOOGLE_AI en texto claro viajan a la nube MS. Está en .gitignore/no-trackeado (git OK), pero superficie ampliada. Considerar rotar service_role.

### 🟡 Medios
- **M1 D-180 cuantificado.** `usage.ts:145-148` no selecciona `cache_creation_tokens` (sí se persiste en `logging.ts:47`). Subreporte de costo IA ~10-20%. Panel dice "estimado" → no es cifra falsa, subestima.
- **M2 Precio Haiku contradictorio.** `usage.ts:188` $0.25/$1.25 vs `models.ts:5-6` comentario $1/$5. Una está mal → si el real es $1, panel subreporta Haiku 4×. Unificar `MODEL_PRICES`.
- **M3 Resumen IA se alimenta de NIS/IBSO eliminado.** `dm-resumen/route.ts:176-199` + `dm-report` cargan `client_nis_assessment` (zombie per CLAUDE.md). Quitar o reactivar, no dejar en limbo.
- **H2 Umbral carga 5 vs 6.** `TeamOccupancy.tsx:33` "sobrecargado" con >=5 vs tooltip/barra "/6". Unificar `MAX_ACTIVE`.
- **H4 PDF escaneado sin OCR → parse_status "ok".** `queries.ts:75` marca failed solo si trim vacío, pero marcadores `<!-- page:N -->` dan length>0 → doc sin texto real pasa a la IA. Umbral mínimo de texto alfanumérico.
- **SEG crons fail-open** si CRON_SECRET vacía (`ingest-competitor-reports`, `auto-update`, `embed-chunks`) → unificar a `verifyCron` fail-closed.
- **SEG SSRF redirect no revalidado** en `ingest-report`+3 sitios (`redirect:"follow"`). Con clientes reales sube el riesgo. `redirect:"manual"`+revalidar cada salto.
- **SEG guard SSRF duplicado más débil** en `extract-test.ts:64-104` → usar `isPublicHttpUrl`.

### 🟢 Menores / forma
- Labels wizard DM-IA truncados ambiguos: 2× "Modelo de ne..." indistinguibles (Altamira).
- Header cliente "80/84 campos" vs tab "6/8 pasos" — denominadores distintos (intencional pero puede confundir).
- 7 warnings W3 check:design (divs clickeables sin semántica botón).
- Panel monitoreo dice "Búsqueda semántica Inactiva" mientras código/deuda dice Voyage activo — verificar (puede ser solo "sin actividad 30d").
- L1 score consolidado con 3 fórmulas (max vs suma) · L2 Gemini loggea costo $0 · zip-bomb sin tope de ratio · truncateMarkdown corta a media tabla.

### ⭐ Hallazgo de negocio (por encima de lo técnico)
**Adopción ~0 en 30 días.** Panel monitoreo-ia: TODO "SIN DATOS / Sin actividad" (respuestas exitosas, velocidad Aurora, caché, uso Elena). La app está técnicamente sólida pero nadie la usó en el período. Para un piloto, esta es LA señal — un reporte roto (C2) importa poco si nadie llega a esa etapa. Métrica HEART a instrumentar: # consultores que completan 1 estudio DM end-to-end/mes.

### Puentes forma↔fondo (lo que un audit de un solo lado no ve)
1. Trazabilidad "15 retrasadas" (Equipo): cuadra en superficie (4+5+6) pero H1 la subcuenta (iniciadas-vencidas fuera) + D-179 la sobrecuenta en ventana 6h CDMX. El número que decide asignaciones tiene doble sesgo.
2. Matriz consistencia: C1 mismo tema, 2 pantallas, 2 clasificaciones → documento que se contradice ante el cliente.
3. Promesa-feature: C2 etapa Reporte se ve "Disponible" pero backend no entrega → loop no cierra.

---

## Histórico previo (contexto — auditorías de código incremental)

**Fecha:** 2026-05-14 (sesión 41b — auditoría /configuracion: catálogo unificado herramientas + 6 fixes flujos-ia)
**Calificación global:** 9.9 / 10

---

## Implementado sesión 41b

### ✅ Catálogo unificado `herramientas/page.tsx`
- `TOOL_CATALOG` array único con `implemented: boolean` + `healthKey` — elimina dos arrays desincronizados.
- Voyage Rerank + Anthropic Batch API: corregidos de PROPUESTA → ACTIVO (implementados desde s35/s39 pero página nunca actualizada).
- Health check dedup via Set de keys únicas (Voyage Embeddings + Rerank comparten un solo ping a la API).
- Patrón documentado en CLAUDE.md: al implementar herramienta → `implemented: false → true` + `healthKey` + función en `HEALTH_CHECKS`.

### ✅ 6 fixes `flujos-ia/page.tsx`
- `revalidate` 86400 → 3600 (era 24h, ahora 1h).
- DOC_STEPS paso 4: warn de brecha eliminado (inline embeddings s40 resuelve gap) → lane A + note positiva.
- CHAT_STEPS paso 2: "pendiente prod" → "BM25 + Voyage + Rerank activos".
- DM_STEPS paso 4: "Batch API propuesto" → "Anthropic Batch API activo".
- Tabla referencia: Voyage Rerank + Batch API → Activo.
- Link roto `/configuracion/auditoria-ia` (redirige a sí misma) → `/configuracion/monitoreo-ia`.

### ✅ Auditoría 19 páginas /configuracion
- 14 páginas sin issues (dinámicas, sin datos falsos).
- Issues resueltos en herramientas + flujos-ia (únicos que tenían datos obsoletos).
- Sección configuración 100% sincronizada con estado real de prod.

## Pendientes activos post-sesión 41b

Sin pendientes técnicos activos.

---

## Resumen ejecutivo sesión 40

Completar el batch de mejoras propuesto en `/configuracion/monitoreo-ia`. Dos commits: uno para las primeras 3 mejoras (TTFT tracking + embed-on-upload + sources SSE), otro para las 2 restantes (costo por cliente UI + pre-warm caché). Migración 0097 aplicada a prod. ESLint 0/0 · TSC 0/0.

## Implementado sesión 40

### ✅ TTFT (Time To First Token) tracking
- Mig 0097: `ai_calls.ttft_ms INTEGER` + índice parcial WHERE NOT NULL. Aplicada.
- `lib/ai/logging.ts`: campo `ttftMs?: number | null` en `AiCallLog`, propagado al insert DB.
- `app/api/chat/route.ts`: captura TTFT en primer `content_block_delta` del stream SSE.
- `lib/ai/usage.ts`: `avg_ttft_ms` en `UsageByRole` tipo y cálculo. SELECT incluye `ttft_ms`.
- `monitoreo-ia/page.tsx`: columna "TTFT" en tabla Uso por rol IA con tooltip. Datos en celdas por rol. colSpan embeddings row 6→7.

### ✅ Embeddings inline al subir documento
- `app/api/clients/[id]/documents/route.ts` Path B (pre-signed URL): si `parse_status=ok` y `VOYAGE_API_KEY` existe, fire-and-forget `persistDocumentChunks` + `generateEmbeddingsBatch` inmediatamente post-upload.
- Elimina brecha de 6:30 AM: documentos subidos durante el día tienen embeddings listos el mismo día.
- Cron 6:30 AM queda como red de seguridad para fallos inline.

### ✅ Indicador de fuentes en chat (chip teal)
- `lib/ai/stream-types.ts`: nuevo evento `ChatStreamSources { type: "sources"; chunks_used: number; pages: number[] }`. Tipado en union + validator.
- `app/api/chat/route.ts`: `sourceMeta` captura chunksUsed + páginas únicas ordenadas. Emite evento `sources` antes del primer delta cuando RAG activo.
- `components/chat/ChatWindow.tsx`: estado `lastSources`, reset al enviar mensaje. Chip teal "N fragmentos del informe · págs. X, Y, Z" debajo del área de input.

### ✅ Panel costo IA por cliente en monitoreo-ia
- `lib/ai/usage.ts`: `UsageByClient` type + `by_client: UsageByClient[]` en `UsageSummary`. Top 10 clientes por costo USD en período.
- `monitoreo-ia/page.tsx`: reemplaza panel "Top clientes (por llamadas)" con "Costo IA por cliente" (Cliente | Llamadas | Costo USD).

### ✅ Pre-warm caché Anthropic al abrir cliente
- `app/api/clients/[id]/warm-context/route.ts` (nuevo): POST, auth `requireConsultorForClient`, llama Anthropic con `max_tokens=1` + system blocks completos → siembra caché ephemeral.
- `components/ClientTabs.tsx`: `useEffect` dispara `POST /warm-context` al montar (fire-and-forget). Primer mensaje del consultor paga cache_read (~10%) en lugar de cache_write.

## Tests

```
TSC     : 0/0 (verificado pre-commit vía hook)
ESLint  : 0/0
Mig     : 0097 aplicada a prod lyideepglavkmuuujoqz
```

## Score sesión 40

| Dimensión | Post-39 | Post-40 | Delta |
|-----------|---------|---------|-------|
| Observabilidad | 9.8 | 9.9 (TTFT en monitoring, sources chip en chat) | ↑ |
| Rendimiento | 9.6 | 9.8 (embed inline, pre-warm caché) | ↑ |
| Transparencia consultor | 9.4 | 9.7 (chip fragmentos + páginas visible en chat) | ↑ |
| Calidad de código | 9.9 | 9.9 | = |
| **Global** | **9.9** | **9.9** | = |

## Pendientes activos post-sesión 40

Sin pendientes técnicos activos.

---

## Auditoría anterior: 2026-05-14 (sesión 39)

**Fecha:** 2026-05-14 (sesión 39 — 6 mejoras IA: routing Aurora, resumen historial, citaciones página, audit trail, tokens dinámicos, retry 429)
**Calificación global:** 9.9 / 10

---

## Resumen ejecutivo sesión 35

Implementación completa de las recomendaciones accionables del panel `/configuracion/monitoreo-ia`. 10 fixes + 2 features nuevas (búsqueda semántica en chat + Haiku fast path ai-fill). ESLint 0/0, 357/357 tests, D-178 cerrado, D-04 eliminado.

## Fixes aplicados en sesión 35

### ✅ Tarjeta "Reporte PDF" — false positive eliminado
`monitoreo-ia/page.tsx`: trigger cambiado de `latenciaMs > THRESHOLDS.latenciaMs` → `dmReportActive` (presencia de stage `dm_report` en `by_stage`). La tarjeta solo aparece cuando se han generado reportes DM reales ese mes.

### ✅ D-178 cerrado — latencyMs real en 3 routes batch
- `dm-iros/route.ts` — `Date.now() - new Date(latestBatch.created_at).getTime()`
- `dm-report/route.ts` — `Date.now() - new Date(doc.created_at).getTime()`
- `dm-benchmark/route.ts` — `Date.now() - new Date(latestResult.created_at).getTime()`

### ✅ voyageActive: `> 100` → `> 0`
### ✅ THRESHOLDS.latenciaMs: 10s → 30s
### ✅ ESLint 0/0 — `_isGenerating` en BenchmarkIrosSection
### ✅ feat(chat): búsqueda semántica + rerank en chat
### ✅ Orden de bloques de sistema — cache preservado
### ✅ Tarjeta "indexación nocturna" — false positive eliminado
### ✅ AI-fill Haiku fast path
### ✅ D-04 eliminado — Metodología ResponSable

## Score histórico

| Sesión | Score |
|--------|-------|
| s22 | 9.6 |
| s25 | 9.8 |
| s27 | 9.7 |
| s28 | 9.7 |
| s31 | 9.7 |
| s32c | 9.8 |
| s33 | 9.8 |
| s35 | 9.9 |
| s39 | 9.9 |
| **s40** | **9.9** |
