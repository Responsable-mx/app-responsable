# Features — App ResponSable

## Prioridades
- [A] Bloqueante para MVP — debe funcionar para lanzar piloto
- [B] Post-piloto — se agrega después de validar MVP
- [C] Futuro — nice to have

## MVP (Fase 1) — Estado: bootstrap completo

- [A] ✅ Auth OTP email con whitelist de consultores (Supabase + Resend)
- [A] ✅ Gestión de clientes con contexto (6 bloques estructurados del Word
  "Contexto del cliente"): info general, modelo de negocio, impactos,
  contexto regulatorio, estrategia de sostenibilidad, stakeholders.
  Todos los consultores ven y editan todos los clientes.
- [A] ✅ Chat con 4 roles IA (Aurora/Rebeca/Elena/Valeria) — selector de rol
  y selector de cliente opcional. Streaming SSE token por token.
- [A] ✅ Prompt caching del contexto del cliente (ephemeral, 2 breakpoints)
  para no pagar 4× el preámbulo en una sesión.
- [A] ✅ System prompts de los 4 roles en `lib/ai/roles.ts` (XML tags, reglas
  primero, salida accionable).
- [A] ✅ Middleware de sesión Supabase + redirects /login.
- [A] ✅ ErrorBoundary en root + manejo de errores con mensajes accionables.
- [A] ✅ Migración SQL idempotente + RLS básica.
- [A] ✅ Helper `scripts/apply-sql.mjs` con modo paranoico + tests de seguridad.

## Post-piloto (Fase 2)

- [B] Knowledge Base con sync desde OneDrive (pgvector + Microsoft Graph API)
- [B] Web Research con citas y protección de KB (Brave Search API)
- [B] ✅ Documentos por cliente con extracción automática — Sprint B1: parsers PDF (pdf-parse) + DOCX (mammoth + html→md) + XLSX (exceljs→md tables) + PPTX (JSZip + slide XML) + TXT/MD; tabla `client_documents` con storage_path + markdown_content + parse_status; bucket Supabase Storage privado `client-documents`; APIs `POST/GET /api/clients/[id]/documents`, `GET/DELETE /api/clients/[id]/documents/[docId]`; modal "Importar" tabbed (Pegar texto + Subir archivo + Mis documentos) con SWR; doc-fill reusa contenido de docs subidos. Migración `0041` aplicada — may-2026
- [B] ✅ Sprint B2 — IA investiga URL informes públicos: API `POST /api/clients/[id]/research-reports` (web_search Anthropic encuentra candidatos PDF públicos); API `POST /api/clients/[id]/ingest-report` (descarga URL con SSRF guard + content-type whitelist + 25MB cap → parser → guarda como `client_document` kind=`sustainability_report|financial_report` + actualiza columna URL en clients); UI `ReportSearchFields` en ClientForm con botón "Buscar con IA" + lista candidatos clickeables; `ai-fill` incluye markdown_content de informes como FUENTE PRIMARIA antes de web_search (30k chars/doc). Columna `financial_report_url` añadida en migración `0041` — may-2026
- [B] ✅ UX cuestionario Sprint A — confirm modal editar campo validado, toast al validar, fuente directa (1 fuente=link, N>1=drawer), fecha actualización por campo, text→AutoResizeTextarea, banner Doble materialidad IA — may-2026
- [B] ✅ Servicio "Doble materialidad por IA" — catálogo `doble_materialidad_ia` (`seeds.ts`), migración `0040`, seleccionable en ficha cliente, banner en cuestionario — may-2026
- [B] Control de acceso RBAC (admin gestiona prompts/KB/logs, consultor solo usa)
- [B] ✅ Export PDF de reporte de cliente — `@react-pdf/renderer`, endpoint `/api/clients/[id]/export-pdf`, botón `ExportPdfButton`, may-2026
- [B] ✅ Logo del cliente via URL — campo `logo_url` en `ClientForm`, preview live en `ClientAvatar`, may-2026
- [B] ✅ Seniority + asignación consultores — niveles de seniority por catálogo (`seniority_levels` en `catalog_items`), default en `authorized_users.seniority_level`, override por proyecto en `client_consultors.seniority_level`; tab "Equipo" en `ClientTabs`; API `/api/clients/[id]/consultors`; migración `0030` aplicada may-2026
- [B] ✅ Historial de conversaciones persistido por cliente — `chat_sessions` (mig 0028), `lib/chat-sessions.ts`, `api/chat-sessions`, panel en `ChatWindow` sidebar, may-2026
- [B] ✅ Trazabilidad básica (log de uso por rol/usuario/fecha) — `ai_calls` + vista `ai_calls_daily_by_role`, `lib/ai/usage.ts`, `/configuracion/uso-ia`, may-2026
- [B] Expansión a otros entregables (propuestas, diagnósticos, reportes GRI)
- [B] Métricas de calidad (iteraciones, tiempo, score por entregable)
- [B] ✅ Integrar navegación de la app en system prompt de los 4 roles — `DEFAULT_APP_NAVIGATION` en `lib/ai/prompts.ts`, may-2026
- [B] ✅ Guided tour onboarding con driver.js para primer login — `components/GuidedTour.tsx` + `/api/settings/tour-version`, auto-bump via POST (admin), may-2026
- [B] ✅ Cron `daily-qa-responsable` (operacional, solo reporta fallos) — `app/api/cron/daily-qa/route.ts` + `vercel.json`, may-2026
- [B] ✅ Cron `audit-health` quincenal (cobertura + deuda + costo API) — schedule en `vercel.json`, may-2026
- [A] ✅ Tab "Doble Materialidad IA" — `components/doble-materialidad/DoubleMaterialidadTab.tsx`, visible solo si `services` incluye `doble_materialidad_ia`. 3 etapas: (1) Contexto = link a cuestionario existente, (2) Benchmark: IA propone empresas (Sonnet Batch API) → consultor valida → IA compara vs cliente en campos ESG (Sonnet Batch); tabla comparativa con `ExpandableCell` + columna cliente destacada; collapsible config + fields. (3) Reporte PDF: Opus Batch genera narrativa ~8k chars → `lib/pdf/dm-report.tsx` con charts SVG (`@react-pdf/renderer`) → `export-dm-pdf` endpoint → descarga ~25KB. Migraciones `0045`–`0046`: `dm_benchmark_companies` + `dm_benchmark_results` + `dm_report_batches`. Rate limit DB (3 calls/5min benchmark, 3 calls/5min report). RBAC `requireConsultorForClient`. may-2026

## Pendiente de arranque

- [B] ✅ **IROs ESRS en DM IA** — 10 estándares ESRS (E1–E5, S1–S4, G1) × 2 dimensiones (impacto + riesgo/oportunidad) reemplazan los 5 campos estáticos. `dm_iro_config` + RLS + seed completo (mig 0060). `lib/dm/iros.ts` cache 7200s + `getIroQuestionnaireContext`. Benchmark y reporte inyectan IROs como ejes; contexto del cuestionario por campo vinculado. `/configuracion/iros` editable por admin. `DoubleMaterialidadTab` usa `/api/iros` SWR. may-2026

- [B] ✅ **DM-IA navegación mejorada — Ruta A** — Stepper sticky `top-0 z-10`. 8 secciones colapsables con `CollapsibleStageSection`: activa auto-expandida, done/pending colapsadas por default. Header clickable con badge estado + chevron ▼/▲. CTA "→ Siguiente etapa" al pie de cada sección. scroll offset 120px para compensar stepper sticky. Migración `0070` (índice D-145). `DoubleMaterialidadTab.tsx`. may-2026

- [B] **DM-IA navegación mejorada — Ruta B (arquitectura target)** — Sub-tabs por etapa (activeStage state + URL param `?stage=N`). Solo 1 etapa renderizada → DOM 7× más liviano. Extracción de `BenchmarkSection`, `IrosSection`, `ContextoSection`, `ReporteSection` a archivos separados. Stepper = tab bar con aria-selected. 5–6 archivos. Sprint siguiente.

## En desarrollo (may-2026)

- [A] 🔄 Templates de servicio + visión global proyectos — `/configuracion/servicios` (CRUD plantillas etapas/actividades/duraciones), aplicar plantilla a cliente, vista global en `/equipo`. 15 archivos, migración 0033. Semáforo 🟢.

## Futuro (Fase 3)

- [C] Generación de documentos DOCX con branding ResponSable
- [C] Generación de presentaciones PPTX con branding ResponSable
- [C] Integración Basecamp (notificaciones)
- [C] Integración Slack
