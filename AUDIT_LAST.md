# AUDIT_LAST.md — App ResponSable

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
