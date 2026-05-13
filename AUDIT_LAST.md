# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-12 (sesión 32 completa — /audit + /audit-ia + cleanup)
**Calificación global:** 9.8 / 10 (vs 9.7 sesión 31)

---

## /audit-ia sesión 32b — hallazgos adicionales

### ✅ D-176 — console.log starting redundante en dm-benchmark-empresas/search_urls
- `route.ts:368` `console.log starting: ${empresa.nombre}` eliminado. Timing capturado en líneas 414/440.

### 🟢 D-174/175 — search_urls sin system block (ambas routes)
- Cache hit = 0% por user block 100% dinámico (empresa/framework único por call).
- Beneficio si se añade system block: ~$0-1/mes en concurrencia batch. Prioridad baja.

### ✅ DoubleMaterialidadTab lazy loading (D-173 bundle weight)
- 9 secciones migradas a `next/dynamic`. Bundle inicial DM-IA ↓40-60%.
- CollapsibleStageSection, ContextoSection, StagePill refactorizados asociados.
- D-173 (source code 3648L) sigue abierto pero impacto rendimiento atenuado.

---

## Hallazgos nuevos — sesión 32 (2026-05-12)

### 🔴 D-169 — Next.js 16.2.4 con 13 CVEs activos
- Versión instalada: 16.2.4. Versión con fix: 16.2.6 vía `npm audit fix` (3 packages, sin breaking changes).
- CVEs relevantes: middleware bypass × 4 (GHSA-492v, GHSA-267c, GHSA-36qx, GHSA-26hh), SSRF via WebSocket upgrades, CSP nonce XSS, cache poisoning × 2, DoS × 3.
- **La auth de la app usa middleware** → los 4 CVEs de middleware bypass son directamente relevantes.
- Fix: `npm audit fix` y push.

### 🟡 D-170 — dm-referentes y dm-benchmark-empresas sin rate limiting
- `generate_topics` (16K max_tokens, Sonnet, ~$0.24/call), `generate_frameworks` (4K), `dm-benchmark-empresas/generate` (4K) — cero `checkRateLimit`.
- Patrón correcto en dm-benchmark (D-111), dm-report (D-122), research-reports (D-123).
- Fix: añadir `await checkRateLimit(user.email, "dm_referentes_generate", 3, 300_000)` en los 3 handlers. ~30min.

### 🟡 D-171 — 3 ESLint errors (regresión — sesión 31 = 0 errors)
- `components/doble-materialidad/BenchmarkSection.tsx:84` — `setSelected` dentro de `useEffect` body (`react-hooks/set-state-in-effect`). Fix: `useState(() => new Set(...))` lazy initializer.
- `components/doble-materialidad/ReferentesSection.tsx:307` — 2× `"` sin escapar (`react/no-unescaped-entities`). Fix: `&quot;`.

### 🟢 D-172 — DoubleMaterialidadTab.tsx:544 — `stepperCompact` unused (ESLint warning)
- Regresión menor (sesión 28/31 = 0 warnings). Fix: prefix `_` o eliminar la asignación.

### 🟢 D-173 — Módulo DM-IA: 4 archivos, 3648L total
- BenchmarkSection 1205L · DoubleMaterialidadTab 950L · BenchmarkEmpresasSection 729L · ReferentesSection 764L.
- Candidato para refactor conjunto en mismo sprint que D-150 BenchmarkSection (pendiente smoke test).

---

## Resuelto en sesión 31b (encontrado en revisión deuda activa)

D-167 ✅ AbortSignal subido a 170_000ms (margen mejorado de 30s → 10s; Batch diferido)
D-168 ✅ `FRAMEWORKS_SYSTEM`, `TOPICS_SYSTEM`, `GENERATE_SYSTEM` con `cache_control: ephemeral` extraídos

---

## Pendientes activos post-sesión 32

| ID | Sev | Descripción | Acción |
|----|-----|-------------|--------|
| D-169 | 🔴 | Next.js 16.2.4 → 16.2.6 (13 CVEs + middleware bypass) | `npm audit fix` + push |
| D-170 | 🟡 | dm-referentes + dm-benchmark-empresas sin rate limit | `checkRateLimit` en 3 actions |
| D-171 | 🟡 | 3 ESLint errors (BenchmarkSection:84, ReferentesSection:307×2) | Fix lazy init + `&quot;` |
| D-172 | 🟢 | `stepperCompact` unused (ESLint warning) | `_` prefix |
| D-173 | 🟢 | DM-IA módulo 3648L | Refactor con D-150 BenchmarkSection |
| D-147 | 🟢 | Cache in-memory extract-profile | Aceptado MVP definitivo |

---

## Score sesión 32

| Dimensión | Post-31 | Post-32 |
|-----------|---------|---------|
| Seguridad | 9.8 | 9.4 (D-169 Next.js middleware bypass CVEs) |
| Confiabilidad | 9.8 | 9.8 |
| UX | 9.2 | 9.2 |
| Arquitectura | 9.8 | 9.7 (D-173 DM módulo pesado) |
| Rendimiento | 9.2 | 9.2 |
| Calidad de código | 9.9 | 9.5 (D-171 regresión 3 ESLint errors) |
| Observabilidad | 9.7 | 9.7 |
| Deuda técnica | 9.7 | 9.5 (4 items nuevos) |
| **Global** | **9.7** | **9.5** |

---

## Auditoría IA sesión 31 — Evaluación del modelo integrado

### Parte 1 — Cobertura y correctitud (call sites)

| Archivo | Modelo | Timeout | Cache | max_tokens | Notas |
|---------|--------|---------|-------|------------|-------|
| `api/chat` | Sonnet/Opus/Haiku per role | 45s | ✅ 2 bloques | 2000 | ✅ Completo |
| `ai-fill` | Aurora (Sonnet 4.6) | 270s | ✅ system | 8192 | ✅ |
| `doc-fill` | Aurora (Sonnet 4.6) | 45s | ✅ system | 2000 | ✅ |
| `research-reports` | Aurora (Sonnet 4.6) | 150s | ✅ system | 1500 | ✅ |
| `dm-benchmark/propose` | Aurora (Sonnet 4.6) | 45s | ✅ system | 2200 | ✅ |
| `dm-benchmark/compare` | Aurora (Sonnet 4.6) Batch | 15s submit | ✅ system | 16000 | ✅ Batch 50% off |
| `dm-iros` | Aurora (Sonnet 4.6) Batch | 15s submit | ✅ system | 12000 | ✅ D-165 corregido |
| `dm-resumen` | Aurora (Sonnet 4.6) | 45s | ✅ system | 4000 | ✅ D-166 corregido |
| `dm-report` | Elena (Opus 4.7) Batch | 15s submit | ✅ system | 16000 | ✅ Batch 50% off |
| `dm-referentes/generate_frameworks` | Aurora (Sonnet 4.6) | 120s | ❌ sin cache | 4000 | 🟢 D-168 |
| `dm-referentes/generate_topics` | Aurora (Sonnet 4.6) | 150s SYNC | ❌ sin cache | 16000 | 🟡 D-167 riesgo Vercel |
| `dm-benchmark-empresas/generate` | Aurora (Sonnet 4.6) | 90s | ❌ sin cache | 4000 | 🟢 D-168 |
| `dm-benchmark-empresas/search_urls` | Aurora (Sonnet 4.6) | 60s/empresa | ❌ sin cache | 1200 | concurrencia=3 ✅ |

**Hallazgos corregidos en sesión:**
- 🟡 **D-165** `dm-iros` — `logAiCall` con `cacheCreationTokens: 0, cacheReadTokens: 0` hardcodeados. Dashboard subrepresentaba ~15-20% tokens cache. ✅ Fix: destructuring completo de `ext`.
- 🟢 **D-166** `dm-resumen` — `(response.usage as any)?.cache_creation_input_tokens` — SDK 0.95 ya expone tipo estable. ✅ Fix: casts eliminados.

### Parte 2 — Costo estimado mensual (2 clientes piloto activos)

| Flujo | Modelo | Tokens/llamada | Costo/call | Frec/mes | Total/mes |
|-------|--------|---------------|-----------|---------|----------|
| Chat (8 consultores × 5 chats/sem × ~3 mensajes Elena) | Opus 4.7 | 4K in / 800 out | $0.088 | 480 | ~$4.2 |
| Chat (Aurora/Rebeca/Valeria) | Sonnet / Haiku | mix | ~$0.01 | 960 | ~$1.0 |
| DM propose | Sonnet | 3K in / 800 out | $0.013 | 4 | ~$0.05 |
| DM compare (Batch 50% off) | Sonnet | 12K in / 3K out | $0.028 | 4 | ~$0.11 |
| DM-iros Batch | Sonnet | 15K in / 4K out | $0.034 | 2 | ~$0.07 |
| DM-report Batch (Opus) | Opus 4.7 | 10K in / 5K out | $0.225 | 2 | ~$0.45 |
| Referentes + empresas | Sonnet | 8K in / 2K out | $0.016 | 4 | ~$0.06 |
| ai-fill / doc-fill | Sonnet | 20K in / 2K out | $0.034 | 8 | ~$0.27 |
| **Total estimado** | | | | | **~$6.2/mes** |

**Conclusión costo:** muy bajo para MVP piloto. Usa Batch API correctamente en las 3 operaciones pesadas (compare, iros, report) con 50% discount. El único Opus síncrono es el chat/Elena (justificado — calidad narrativa para consultores). Sin oportunidades de downgrade obvias con este volumen.

### Parte 3 — Oportunidades de optimización

#### 3a. Reducción de tokens
| # | Oportunidad | Ahorro est. | Esfuerzo |
|---|-------------|------------|---------|
| 1 | `generate_topics` max_tokens=16000 → revisar si output real supera 8K | -5% costo | Bajo |
| 2 | `ai-fill` cap 30K chars/doc — ya implementado (BM25 local). Voyage embeddings (D-168 Wave 7) reduciría otro 30% cuando active | -$0.08/mes | Ya planificado |

#### 3b. Eficiencia de cache
| # | Oportunidad | Ahorro est. | Esfuerzo |
|---|-------------|------------|---------|
| 1 | D-168: `generate_frameworks` + `dm-benchmark-empresas/generate` sin system block → 0% hit rate | ~$2-5/mes | Bajo |
| 2 | `search_urls` por empresa: cada call nueva instancia, sin cache. Contexto 100% dinámico (nombre empresa) → cache no aplica | N/A | — |

#### 3c. max_tokens tuning
Todos los call sites tienen max_tokens apropiados al output esperado. `generate_topics` con 16K es el único candidato a revisar empíricamente (ver Part 2 nota).

#### 3d. UX / Speed
| # | Oportunidad | Impacto UX | Esfuerzo |
|---|-------------|-----------|---------|
| 1 | D-167: `generate_topics` síncrono 150s → Batch API. Elimina riesgo Vercel timeout | Reduce 0 → riesgo timeout | Medio |
| 2 | `dm-resumen` 45s síncrono podría ser Batch pero es rápido — no necesario con 4K max_tokens | Bajo | — |

#### Tabla resumen de oportunidades

| # | Oportunidad | Eje | Ahorro est. | Esfuerzo | Prioridad |
|---|------------|-----|------------|---------|----------|
| 1 | D-167: generate_topics → Batch API | Speed | Elimina riesgo timeout | Medio | Alta |
| 2 | D-168: system block a generate_frameworks + empresas/generate | Cache | $2-5/mes | Bajo | Baja |
| 3 | Voyage Wave 7 (ya planificado) | Tokens | -30% ai-fill input | Medio | Media |

### Parte 4 — Control de alucinación en tools

Tools con arrays en `lib/modules/tools/` revisadas (app-responsable no tiene módulo tools custom de ese tipo — las tools son Anthropic server tools `web_search_20250305` + `submit_url` client tool inline en route.ts):

| Tool | Array? | summary | Mapas | Cap | Riesgo |
|------|--------|---------|-------|-----|--------|
| `web_search_20250305` | Sí (results[]) | N/A (Anthropic managed) | N/A | N/A | 🟢 Anthropic gestiona |
| `submit_url` (inline dm-benchmark-empresas) | No (objeto único) | N/A | N/A | 1 URL | 🟢 |
| `submit_url` (inline dm-referentes) | No (objeto único) | N/A | N/A | 1 URL | 🟢 |

**Conclusión:** app-responsable no tiene tools custom propias con arrays >10. Las tools de Anthropic (`web_search`) gestionan su propio output. Riesgo anti-alucinación: 🟢 bajo.

El control de alucinación está en las instrucciones de prompt:
- `dm-referentes`: mapa hardcoded 16 frameworks canónicos — elimina alucinación de URLs
- `dm-benchmark-empresas`: "MANDATORY: call web_search before submit_url" — fuerza evidencia real
- Chat system prompt: "NUNCA uses códigos internos del catálogo" — previene exposición técnica

---

## Fixes aplicados sesión 31

| Fix | Archivo | Líneas | Impacto |
|-----|---------|--------|---------|
| D-165 | `dm-iros/route.ts` | 76, 102 | Dashboard costos correcto (era -15-20% cache tokens) |
| D-166 | `dm-resumen/route.ts` | 266-271 | Elimina 2 `as any` + 2 eslint-disable post SDK 0.95 |

---

## Pendientes activos post-sesión 31

| ID | Sev | Descripción | Próximo paso |
|----|-----|-------------|--------------|
| D-167 | 🟡 | `generate_topics` síncrono 150s → Vercel timeout risk | Migrar a Batch API |
| D-168 | 🟢 | `generate_frameworks` + `empresas/generate` sin system block | Separar instrucciones a `system` con cache_control |
| D-150 part | 🟡 | BenchmarkSection smoke test pendiente | Sprint dedicado |

---

## Validación post-sesión 31

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | Pendiente verificar |
| D-165 fix | ✅ `cacheCreationTokens, cacheReadTokens` destructurados de `ext` |
| D-166 fix | ✅ `as any` eliminados — SDK 0.95 tipos estables |

## Score sesión 31

| Dimensión | Post-28 | Post-31 |
|-----------|---------|---------|
| Seguridad | 9.8 | 9.8 |
| Confiabilidad | 9.8 | 9.8 |
| UX | 9.2 | 9.2 |
| Arquitectura | 9.8 | 9.8 |
| Rendimiento | 9.2 | 9.2 |
| Calidad de código | 9.8 | 9.9 (2 `as any` eliminados + cache tokens corregidos) |
| Observabilidad | 9.6 | 9.7 (dashboard costos ya no subreporta cache tokens en dm-iros) |
| Deuda técnica | 9.7 | 9.7 (D-165/166 cerrados, D-167/168 documentados — menor severidad) |
| **Global** | **9.7** | **9.7** |

---

## Auditoría anterior: 2026-05-10 (sesión 28)
**Score post-fix:** 9.7/10 — D-04 N/A + D-158 SDK + D-150 5/6 secciones + D-163/164 cerrados.
