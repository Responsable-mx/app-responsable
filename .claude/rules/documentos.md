---
paths:
  - "lib/documents/**"
  - "components/documents/**"
  - "app/api/clients/*/documents/**"
  - "app/api/cron/**"
  - "**/ai-fill/**"
  - "components/clients/ReportIaButton.tsx"
  - "components/questionnaire/ImportModal.tsx"
---

# Documentos por cliente y retrieval semántico

<!-- Mudado VERBATIM desde CLAUDE.md el 27-oct-2026 (carga sola al tocar los archivos de paths:). -->

## Subsistema de documentos por cliente (Sprint B, may-2026)

Documentos persistentes asociados a un cliente, convertidos a Markdown para
contexto IA. Reemplazan el doc-fill solo-texto del MVP.

### Modelo de datos

- `clients.sustainability_report_url` / `financial_report_url` — columnas de
  metadata. La IA puede investigar y poblar estos URLs.
- `client_documents` (mig 0041): `kind` ∈ {`general`, `sustainability_report`,
  `financial_report`} · `parse_status` ∈ {`pending`, `ok`, `failed`} ·
  `markdown_content` (nullable hasta parse) · `storage_path` único en bucket
  privado `client-documents`. RLS permite lectura/escritura a authenticated;
  DELETE solo via service role (admin via API).
- Cap 25MB por archivo (DB CHECK + bucket file_size_limit + API check
  `MAX_BYTES`). MIME whitelist en bucket + en endpoint POST.

### Parsers (`lib/documents/parsers.ts`)

- PDF: `pdf-parse` v1.1.1 (no actualizar a v2 — API rota)
- DOCX: `mammoth.convertToHtml` + `htmlToMarkdownLite` custom (mammoth no tiene
  markdown nativo aún; cambiar cuando exista)
- XLSX: `exceljs` → markdown table por hoja (xlsx tiene CVE sin fix, NO usar)
- PPTX: `JSZip` extrae `<a:t>` de `ppt/slides/slideN.xml`
- TXT/MD: passthrough
- `truncateMarkdown(MAX=200_000 chars)` para tope global.

### Pipeline ingest desde URL externa

`POST /api/clients/[id]/ingest-report` body `{kind, url}`:

1. SSRF guard (`lib/documents/ssrf.ts`): bloquea localhost, RFC1918, link-local,
   IPv6 ULA. **Cualquier endpoint que haga `fetch()` a URL externa debe usar
   `isPublicHttpUrl` antes**.
2. Fetch con `User-Agent: ResponSable-DocIngest/1.0` + timeout 60s + redirect
   follow.
3. Content-Type whitelist (PDF/DOCX/XLSX/PPTX/TXT/MD/HTML). HTML strip → texto.
4. Tope 25MB (Content-Length + buffer.length post-download).
5. Parse → `client_documents` con `kind` + `source_url`. Actualiza columna URL
   en `clients`.

### Uso en flujo IA (`ai-fill`)

- Carga `listDocumentsByClient(clientId)` y filtra `kind !== general` con
  `parse_status === ok`.
- Inyecta hasta 30k chars/doc como `INFORMES PÚBLICOS DEL CLIENTE — FUENTE
  PRIMARIA` antes de instrucción `web_search`.
- LLM debe citar `source_url` real del informe en `sources.url`. Solo si dato
  no está en informes, complementa con web_search.

### Cron refresh

- `/api/cron/refresh-reports` — semestral (1ro junio + 1ro diciembre 11:00 UTC).
  Solo lista clientes con `sustainability_report` o `financial_report` >180d.
  No re-research automático (costo IA + riesgo URL equivocada). Refresh es
  manual desde botón "Buscar de nuevo" del `ReportIaButton`.

### UI canónica

- Tab "Documentos" en `ClientTabs` (7ma tab) — `components/documents/DocumentsTab.tsx`
- Modal "Importar" en cuestionario tabbed (Pegar / Subir / Mis docs) —
  `components/questionnaire/ImportModal.tsx`
- Botón IA en ClientForm — `components/clients/ReportIaButton.tsx` con timer
  visible 30-90s + cancelable via `AbortController`.

### Reglas para ampliar

- Nuevo `kind` → agregar al CHECK de migración + `KIND_LABEL` + ai-fill mapping
- Nuevo formato → agregar a `detectFileType`/`MIME_TO_TYPE` + parser + bucket
  `allowed_mime_types`
- Nuevo endpoint que descarga URL externa → SIEMPRE pasar por `isPublicHttpUrl`
## Retrieval semántico de documentos (Wave 7 — activo en prod)

### Hoy — BM25 sobre markdown_content (activo en prod via DOC_RELEVANCE_ENABLED=true)

- `lib/documents/relevance.ts`: chunkMarkdown (1.2K + 150 overlap) + scoreChunk BM25-simplified + selectTopChunks (greedy top score, preserva orden doc) + position bonus (1.2x primeros chunks + 1.15x si contiene términos "resumen/conclusion/objetivo/...")
- Activación: env `DOC_RELEVANCE_ENABLED=true` en Vercel production
- Beneficio: ~70% menos input tokens en docs >30K chars
- Limitación: no entiende sinónimos ("emisiones" ≠ "huella climática")

### Voyage AI — Embeddings vectoriales (Wave 7)

**Estado activación (may-2026):**
- [x] `VOYAGE_API_KEY` + `VOYAGE_MODEL=voyage-2` → en `.env.local` (local listo)
- [x] `lib/documents/embeddings.ts` + `app/api/cron/embed-chunks/route.ts` → en repo
- [x] `supabase/migrations/0076_document_chunks_embeddings.sql` → aplicada (tabla + policy ya existen en prod)
- [x] `VOYAGE_API_KEY` + `VOYAGE_MODEL=voyage-3` en Vercel env vars (prod) ✅
- [x] `ai-fill/route.ts`: `searchSimilarChunks` activo antes que BM25 ✅
- [x] `embed-chunks` cron: 669/669 chunks embeddidos en prod (6:30 AM diario) ✅ FULLY ACTIVE
- [x] **Embeddings inline al subir doc** (sesión 40): `documents/route.ts` Path B dispara `persistDocumentChunks`+`generateEmbeddingsBatch` fire-and-forget post-parse. Cron = red de seguridad. Mig 0097: `ai_calls.ttft_ms`.

**`lib/documents/embeddings.ts`:**
- `generateEmbedding(text)` y `generateQueryEmbedding(query)` (input_type "document" vs "query")
- `persistDocumentChunks({documentId, clientId, markdownContent})` upsert idempotente con content_hash dedupe
- `searchSimilarChunks({query, clientId, limit})` cosine similarity en JS (suficiente <500 chunks/cliente); retorna null si VOYAGE_API_KEY falta → caller usa BM25

**Migración 0076:**
- `CREATE EXTENSION vector`
- tabla `document_chunks` con `embedding vector(1024)` (voyage-2 dims)
- Índice IVFFlat cosine + índices por document_id, client_id
- RLS: SELECT authenticated, INSERT/UPDATE solo service_role
- Aplicar con: `node ~/.claude/scripts/apply-sql.mjs supabase/migrations/0076_document_chunks_embeddings.sql --project=lyideepglavkmuuujoqz --confirm-destructive`

**Beneficio esperado:** +25% precisión retrieval vs BM25 en queries con sinónimos / idiomas distintos / paráfrasis.

**Buena práctica — key en sesión de chat:** Si el usuario pega una API key en el chat de Claude Code, guardar inmediatamente en `.env.local` (o `.env.global`). Las keys en historial JSONL de sesiones quedan expuestas en texto claro en `~/.claude/projects/*/**.jsonl`.

