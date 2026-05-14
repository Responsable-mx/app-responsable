# Stack — App ResponSable

Stack base: `~/.claude/STACK_BASE.md`. Solo se documenta aquí lo diferente.

## Diferencias con STACK_BASE

### PDF Export
- **`@react-pdf/renderer` v4** — generación server-side de PDF entregable al cliente.
- Endpoint: `GET /api/clients/[id]/export-pdf` (runtime Node.js, no Edge).
- Template: `lib/pdf/client-report.tsx` — A4, fuente Helvetica integrada, colores brand hex.
- UI: `components/ExportPdfButton.tsx` — client component con estado `busy` + download vía Blob URL.
- Cache: `no-store` (siempre datos frescos al exportar).

### IA
> Prompt engineering y model selection: ver `~/.claude/STACK_BASE.md` (sección AI / Prompt Engineering)

- Claude API (Anthropic SDK) con 4 system prompts especializados por rol
- **Aurora / Rebeca**: Sonnet 4 (calidad narrativa y juicio)
- **Elena**: Opus 4 (análisis estratégico profundo, trade-offs)
- **Valeria**: Haiku 4.5 (validación estructurada)
- Streaming SSE token-por-token (`.messages.stream()`)
- **Prompt caching**: 2 breakpoints ephemerales por request — uno en contexto
  del cliente, otro en el rol. Los 4 roles comparten el preámbulo del cliente,
  así el cache se reutiliza dentro de los 5 min de TTL.
- Config centralizada: `lib/ai/models.ts` (modelos por env var, nunca
  hardcoded).

### Auth
- Supabase OTP email + whitelist (`AUTHORIZED_EMAILS` env var, separado por coma)
- Email transaccional: Resend
- Mismo patrón que `leads` y `s-peak-dashboard`

### Datos
- Tabla `clients` con 6 bloques de contexto como text (markdown libre)
- Campos estructurados (name/sector/countries/size) como columnas para filtrar
- RLS: todos los autenticados leen/escriben todos los clientes (decisión de
  negocio: 8 consultores comparten contexto)
- `access_codes` con RLS denegando acceso directo — solo service role

### Knowledge Base (Fase 2 — pendiente)
- OneDrive como fuente de verdad (Microsoft Graph API para sync)
- pgvector en Supabase para embeddings/búsqueda semántica
- Embeddings: text-embedding-3-small o voyage-3
- Chunking: 1000 tokens, overlap 200

### Web Research (Fase 2 — pendiente)
- Brave Search API (2k queries/mes gratis)
- Protección: nunca incluir contexto de KB interna en queries externas

### Arquitectura de rutas
```
app/
  layout.tsx                     → root con ErrorBoundary
  page.tsx                       → redirect a /chat
  (auth)/login/page.tsx          → OTP flow
  (dashboard)/
    layout.tsx                   → shell con Sidebar
    chat/page.tsx                → 4 roles + selector de cliente
    clientes/
      page.tsx                   → lista
      nuevo/page.tsx             → crear
      [id]/page.tsx              → editar (prefetch paralelo: client+questionnaire+materiality+requireAdmin)
  api/
    auth/
      send-code/route.ts         → OTP email
      login-code/route.ts        → verify OTP
      logout/route.ts
    clients/
      route.ts                   → GET list, POST create
      [id]/route.ts              → GET, PATCH, DELETE
      [id]/consultors/route.ts   → GET (requireUser), POST (requireAdmin) — asignar consultores
      [id]/consultors/[email]/route.ts → PATCH/DELETE (requireAdmin) — seniority override + remover
    chat/route.ts                → SSE streaming con prompt caching
```

### Patrón seniority (may-2026)

Dos niveles sin duplicar lógica:
1. **Default global**: `authorized_users.seniority_level` — nivel base del consultor
2. **Override por proyecto**: `client_consultors.seniority_level` — NULL = "usa global"

En UI: si `client_consultors.seniority_level` es NULL, mostrar "Usa global" y mostrar `authorized_users.seniority_level` en columna separada. Si no es NULL, mostrar badge con el override.

Categoría de catálogo: `seniority_levels` en `catalog_items`. Al agregar una categoría nueva en `lib/catalogs/seeds.ts`, el UI de `CatalogsManager` la incluye automáticamente sin cambios de código.

### Patrón auth en endpoints de equipo

- `GET /api/clients/[id]/consultors` → `requireUser` (todos los autenticados ven el equipo)
- `POST/PATCH/DELETE` → `requireAdmin` + `logChange()` con audit log
- Patrón extrapolable a cualquier sub-recurso de cliente donde lectura es pública para consultores pero mutación es solo admin.

## Observabilidad

- **Sentry** (`@sentry/nextjs` ^9) — error tracking cliente + servidor
- Proyecto: `app-responsable` en org `proactive-strategies` (sentry.io)
- DSN: `NEXT_PUBLIC_SENTRY_DSN` en Vercel env vars
- Config: `sentry.client.config.ts` + `sentry.server.config.ts` + `instrumentation.ts`
- `next.config.ts`: `withSentryConfig(nextConfig)` + Sentry ingest en CSP `connect-src`
- `ErrorBoundary.componentDidCatch` → `Sentry.captureException`
- `TabErrorBoundary.componentDidCatch` → `Sentry.captureException` con tag `tab`
- `tracesSampleRate: 0.1` (10% — cuota free 5k/mes)
- `ignoreErrors: [/40[14]/, /Unauthorized/, /Not Found/]`
- `sourcemaps: { disable: !SENTRY_AUTH_TOKEN }` — sourcemaps solo con token configurado

## Caché

| Dato | Frecuencia cambio | Estrategia |
|------|------------------|------------|
| `catalog_items` (seniority_levels, frameworks, etc.) | Casi nunca | `revalidate: 86400` (ISR diario) |
| `role_permissions` (matriz derechos admin/consultor/cliente) | Casi nunca | `revalidate: 86400` (ISR diario) |
| Datos propios del cliente (su ficha, cuestionario, materialidad) | Todo el tiempo | sin caché — SWR siempre fresco |
| `client_consultors` (asignaciones consultor↔cliente) | Poco — meses | `revalidate: 3600` |
| `authorized_users` (lista usuarios + seniority default) | Poco — meses | `revalidate: 3600` |
| `service_templates` (plantillas etapas/actividades/duraciones) | Poco — días | `revalidate: 3600` (SWR) |
| Estatus proyectos en vista global Equipo (real vs plan) | Todo el tiempo | sin caché — SWR sin revalidateOnFocus delay |
| Informe sustentabilidad/financiero (URL + metadata, IA investiga) | Casi nunca — max 2×/año | `revalidate: 86400` (ISR diario, en Sprint B) |
| Documentos cliente convertidos a Markdown (PDFs subidos) | Casi nunca — max 2×/año | `revalidate: 86400` (ISR diario, en Sprint B) |
| `dm_benchmark_empresas` (empresas de referencia Etapa 3 — fuente de verdad para Benchmark) | Casi nunca — 2-3×/año | `revalidate: 86400` SWR con `revalidateOnFocus: false` |
| `dm_benchmark_companies` (empresas propuestas por IA para DM) | Poco — días/semanas | `revalidate: 3600` (SWR) |
| `dm_benchmark_results` (resultado comparación benchmark DM) | Poco — días/semanas | `revalidate: 3600` (SWR) |
| Reporte PDF DM generado por IA | On-demand — solo al regenerar | sin caché — guardar en `client_documents` kind=`dm_report`, regenerar solo al click "Generar reporte" |
| `dm_iro_config` (definiciones ESRS E1–G1 editables por admin) | Casi nunca — admin edita rarísimo | `revalidate: 7200` (2h, in-memory cache en lib/dm/iros.ts) |
| `dm_benchmark_company_iros` (IROs por empresa benchmark — generados 1 vez, rarísimo regenerar) | Poco — semanas/meses | `revalidate: 3600` (SWR con `revalidateOnFocus: false`) |
| `service_pricing_config` (costo base por tipo de servicio — admin edita rarísimo) | Casi nunca | página costos ahora `force-dynamic` (combina config + stats live) · API GET: `private max-age=3600` |
| `client_services.{is_pilot,actual_cost,sale_price}` (costo real por proyecto) | Todo el tiempo | sin caché — SWR fresco (mismo patrón que datos del cliente) |
| `service_pricing_stats` (promedio real + detalle proyectos por servicio — derivado de client_services) | Todo el tiempo | `force-dynamic` en página costos · API stats: `private, no-store` |

### Aplicar migraciones
- Helper: `node scripts/apply-sql.mjs` (modo paranoico, 17 patrones bloqueados)
- PAT en `~/.claude/.env.global`
- Project ref: `lyideepglavkmuuujoqz` (org ResponSable). Env: `SUPABASE_PROJECT_REF`

## Infraestructura

| Servicio | Cuenta / Equipo | Detalle |
|----------|----------------|---------|
| **Vercel** | Team `nblondel-coders-projects` | Owner: `nblondel-coder`. Producción: `https://app.responsable.net` |
| **Supabase** | Cuenta `nblondel-coder` / Org ResponSable (`xjvhttmltlfxsekbhfid`) | Project `app-responsable` ref `lyideepglavkmuuujoqz`. PAT: `SUPABASE_ACCESS_TOKEN` en `~/.claude/.env.global` |
| **GitHub** | Org `Responsable-mx` | Repo `Responsable-mx/app-responsable` (**público** — código open, app protegida por OTP auth). Auto-deploy activo vía Vercel GitHub App |

> Auto-deploy: cada `git push` a `main` deploya automáticamente a `https://app.responsable.net`. Repo público para evitar el límite de Vercel Hobby (repos privados de org requieren Pro). El código no tiene secretos hardcodeados — todos van en env vars de Vercel.
