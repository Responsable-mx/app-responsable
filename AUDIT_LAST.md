# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-14 (sesión 35 — implementación recomendaciones monitoreo-ia)
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
Inicio de mes con todos los chunks ya indexados generaba 0 llamadas Voyage → tarjeta "Activar búsqueda inteligente" aparecía incorrectamente aunque Voyage estuviera activo.

### ✅ THRESHOLDS.latenciaMs: 10s → 30s
Aurora promedia 46.7s → health check "Velocidad de Aurora" siempre en rojo con umbral 10s. Con 30s: verde <30s, amarillo 30-60s, rojo >60s. Realista para streaming LLM.

### ✅ ESLint 0/0 — `_isGenerating` en BenchmarkIrosSection
Prop `isGenerating` recibida pero no usada internamente → renombrada `_isGenerating`.

### ✅ feat(chat): búsqueda semántica + rerank en chat
`chat/route.ts` ahora corre `searchSimilarChunks` (top-20) + `rerankChunks` (top-8) en paralelo con feedbackMemory. Inyecta fragmentos relevantes del informe del cliente como bloque de sistema antes de cada respuesta de Aurora/Rebeca/Elena/Valeria. Fail-open. Activa la tarjeta "Selección precisa de fragmentos" en monitoreo-ia.

### ✅ Orden de bloques de sistema — cache preservado
`feedbackText` (semi-estático, cacheable) antes de `docChunksText` (dinámico por query, no cacheable). Restaurado `cache_control: ephemeral` en feedbackText. Sin esto, docChunks invalidaba el cache de feedback en cada mensaje.

### ✅ Tarjeta "indexación nocturna" — false positive eliminado
`monitoreo-ia/page.tsx`: trigger cambiado de `voyageSystemErrors > 50` (errores históricos de 30 días) → `nullEmbeddings > 0` (count real de `document_chunks WHERE embedding IS NULL`). Nuevo fetcher `getNullEmbeddingsCount()`. Health check "Búsqueda semántica" actualizado igual. La tarjeta ahora refleja huecos reales, no errores pasados ya resueltos.

## Tests

```
Tests   : 357/357 passed (28 suites)
ESLint  : 0 errors, 0 warnings
TSC     : 0 errors
```

### ✅ AI-fill Haiku fast path
`ai-fill/route.ts`: cuando `vectorChunks.length >= 3` (contexto local suficiente), intenta extracción con Haiku (~12× más barato). Si <40% campos null → retorna sin llamar Sonnet. Si ≥40% null → fallback transparente a Sonnet + web_search. Usa `getTaskConfig("extract")` ya definido en `models.ts`.

### ✅ D-04 eliminado — Metodología ResponSable
Eliminado de DEUDA.md, project_app_responsable.md, project_dm_benchmark_ia.md. Era bloqueo de negocio, no deuda técnica. Nota en memoria: quinta KPI card (~30min código) cuando el equipo defina los pasos.

### ✅ Monitoreo tarjetas limpias
- Rerank: texto actualizado (ya implementado)
- Reporte PDF "tarda demasiado": eliminada (Batch API activo)
- Tabla "Reporte PDF en segundo plano": Propuesto → Activo
- Caché: texto actualizado (ya corregido)

## Pendientes activos post-sesión 35

Sin pendientes técnicos activos.

---

## Score sesión 35

| Dimensión | Post-34 | Post-35 | Delta |
|-----------|---------|---------|-------|
| Confiabilidad | 9.9 | 9.9 | = |
| Observabilidad | 9.6 | 9.8 (D-178 cerrado, latencyMs reales en 3 routes) | ↑ |
| Rendimiento | 9.4 | 9.6 (chat con retrieval semántico, cache order correcto) | ↑ |
| Calidad de código | 9.9 | 9.9 (ESLint 0/0) | = |
| **Global** | **9.8** | **9.9** | ↑ |

---

## Auditoría anterior: 2026-05-12 (sesión 33)

---

## Resumen ejecutivo sesión 33

Sprint `feat(dm-benchmark-iros)` + Wave 7 optimizaciones (6 items: batch Voyage, pgvector RPC, cache prompts 300s, dedup cosineSimilarity, skip feedback vacío, cache feedback 5min) fusionados. D-173 (refactor DM-IA) y D-147 (cache DB-backed) cerrados. ESLint regresión detectada y reparada en sesión.

---

## Fixes aplicados en sesión 33

### ✅ ESLint regresión — 5 errors + 7 warnings → 0/0

**`BenchmarkIrosSection.tsx`** (commit `2970738` introdujo regresiones):
- Línea 57: `groups` creaba nueva referencia en cada render → `useMemo(() => resp?.data?.groups ?? [], [resp])`. Estabiliza deps de 2 `useEffect`.
- Líneas 72, 92: `setIsPolling(true/false)` en body de `useEffect` → `eslint-disable-next-line react-hooks/set-state-in-effect` con justificación (auto-restart polling + sincronización estado real).
- Línea 98: `setActiveCompanyId` en body de `useEffect` → mismo disable con justificación (inicialización tab activa, guard `!activeCompanyId` previene loop).
- Línea 336: `"Generar IROs con IA"` → `&quot;Generar IROs con IA&quot;` (2 unescaped entities).

**`BenchmarkSection.tsx`** (D-173 refactor dejó dead state de la forma inline extraída):
- Líneas 51-52: `addingManual`/`setAddingManual`/`manualForm`/`setManualForm` eliminados (4 unused vars). Form migrado a `ManualAddCompanyForm`.

**`useDmPolling.ts`**:
- Línea 125: `eslint-disable-next-line react-hooks/set-state-in-effect` obsoleto (regla no disparaba, directiva marcada como unused) → eliminado. Código ya no lo necesita.

### ✅ D-147 — DEUDA.md actualizado

Entry D-147 decía "ACEPTADO MVP DEFINITIVO (sesión 27) — NO migrar a DB". Fue implementado definitivamente en sesión 33: `profile_url_cache` (mig 0091, SHA-256 key, TTL 30min, fail-open, upsert+cleanup).

---

## Cobertura de tests

```
Tests   : 322/322 passed (27 suites)
Duration: 17.75s

Statements : 95.12%  (507/533)
Branches   : 89.77%  (430/479)
Functions  : 98.03%  (100/102)
Lines      : 98.45%  (445/452)
```

Gaps menores (no prioritarios — todos son error paths o browser-specific):
- `ConfirmModal.tsx:46` — rama no ejercitada (busy async path)
- `Modal.tsx:46-48,56-60,76,105` — event listeners cleanup (jsdom limitación)
- `Toast.tsx:41-57` — auto-dismiss timer (jsdom `setTimeout`)
- `lib/users.ts:192,208,247,253,309` — error paths DB
- `lib/ai/roles.ts:53,98-101,116,192,209` — ramas de catálogo vacío / fallback
- `lib/catalogs/index.ts` — ramas de caché ISR y fetch externo
- `lib/documents/ssrf.ts:31` — una rama IPv6 edge case

---

## Hallazgos nuevos sesión 33

### 🟡 D-177 — Voyage fetch sin timeout en `lib/documents/embeddings.ts`

`fetch("https://api.voyageai.com/v1/embeddings", { ... })` en línea 43 — sin `signal: AbortSignal.timeout(N)`. El cron `embed-chunks` tiene `maxDuration=300` (5 min). Si Voyage API cuelga, la Lambda espera los 300s completos hasta que Vercel la mata. Desperdicia slot y genera ruido en logs.

Fix: `signal: AbortSignal.timeout(30_000)` en el fetch de Voyage.

### 🟢 D-178 — `logAiCall` con `latencyMs: 0` en dm-benchmark-company-iros

`route.ts:215` — `latencyMs: 0` hardcodeado en el `logAiCall` del poll de resultados batch. Técnicamente correcto (el batch es asíncrono: submit en POST, resultado en GET), pero todas las generaciones IRO muestran 0ms en dashboard costos → monitoring impreciso.

Fix (opcional): almacenar timestamp de creación del batch en `dm_benchmark_iro_batches.submitted_at` (ya existe como columna), calcular `Date.now() - new Date(batch.submitted_at).getTime()` al loggear la finalización.

---

## Tabla completa de issues nuevos + status

| ID | Sev | Descripción | Status |
|----|-----|-------------|--------|
| ESLint regresión | 🔴→✅ | 5 errors + 7 warnings en BenchmarkIrosSection + BenchmarkSection + useDmPolling | ✅ Fixed sesión 33 |
| D-177 | 🟡 | Voyage fetch sin timeout (hang Lambda 5min) | Abierto |
| D-178 | 🟢 | latencyMs=0 en logAiCall IROs batch | Abierto |

---

## Arquitectura — revisión Wave 7 + BenchmarkIros

Wave 7 optimizaciones (QW1-QW5 + B4) revisadas:
- **QW1 batch Voyage**: `generateEmbeddingsBatch(texts[])` — 1 HTTP call por 32 chunks. Correcto.
- **QW3 pgvector RPC**: `match_document_chunks` RPC en Supabase — cosine similarity server-side. Correcto.
- **QW4 cache prompts 300s**: `revalidate: 300` en SWR de prompts del chat. Razonable.
- **QW5 dedup cosineSimilarity**: exportada desde `embeddings.ts`. Correcto.
- **QW2 skip feedback vacío**: `countActiveFeedback` → `if count=0 return ""` sin llamar Voyage. Ahorra 1 call/msg cuando no hay feedback. Correcto.
- **B4 cache feedback 5min**: `Map<string, { count, text, fetchedAt }>` en módulo server-only. Pattern aceptable — serverless local cache por instancia, TTL 5min, datos raramente cambian. No es el mismo antipatrón de D-147 (DM era URL dedupe multi-instancia crítico).

`BenchmarkIrosSection.tsx` + `/api/.../dm-benchmark-company-iros/route.ts`:
- Auth: `requireConsultorForClient` ✅
- Rate limit: `checkAiRateLimit` ✅
- System prompt: con `cache_control: ephemeral` ✅
- Model: `getModelConfig` ✅
- Batch API: `extractBatchResult` helper ✅
- SSRF: `reportUrl` solo inyectado en prompt (no fetched) — no aplica SSRF guard ✅

---

## Score sesión 33

| Dimensión | Post-32c | Post-33 (fixes) | Delta |
|-----------|----------|-----------------|-------|
| Seguridad | 9.8 | 9.8 | = |
| Confiabilidad | 9.8 | 9.8 ✅ D-177 resuelto | = |
| UX | 9.2 | 9.2 | = |
| Arquitectura | 9.7 | 9.7 | = |
| Rendimiento | 9.4 | 9.4 | = |
| Calidad de código | 9.9 | 9.9 (ESLint 0/0 restaurado) | = |
| Observabilidad | 9.7 | 9.6 (D-178 latencyMs=0 open) | ↓ |
| Deuda técnica | 9.8 | 9.8 (D-177 cerrado, D-178 menor) | = |
| **Global** | **9.8** | **9.8** | = |

---

## Pendientes activos post-sesión 33

| ID | Sev | Descripción | Acción |
|----|-----|-------------|--------|
| D-177 | ✅ | Voyage fetch sin timeout | Resuelto sesión 33 — `AbortSignal.timeout(30_000)` |
| D-178 | 🟢 | latencyMs=0 en logAiCall IROs batch | Calcular desde `submitted_at` columna existente |
| D-04 | ⏸ | Metodología ResponSable no definida | Bloqueo de negocio, no técnico |

---

## Auditoría anterior: 2026-05-12 (sesión 32c)
**Score post-fix:** 9.8/10 — D-169/170/171/172/173/174/175/176 todos resueltos.

## Score histórico

| Sesión | Score |
|--------|-------|
| s22 | 9.6 |
| s25 | 9.8 |
| s27 | 9.7 |
| s28 | 9.7 |
| s31 | 9.7 |
| s32c | 9.8 |
| **s33** | **9.8** |
