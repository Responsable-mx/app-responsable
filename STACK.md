# Stack — App ResponSable

Stack base: `~/.claude/STACK_BASE.md`. Solo se documenta aquí lo diferente.

## Diferencias con STACK_BASE

### IA
> Prompt engineering y model selection: ver `~/.claude/STACK_BASE.md` (sección AI / Prompt Engineering)

- Claude API (Anthropic SDK) con 4 system prompts especializados por rol
- **Aurora / Rebeca / Elena**: Sonnet 4 (calidad narrativa y juicio)
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
      [id]/page.tsx              → editar
  api/
    auth/
      send-code/route.ts         → OTP email
      login-code/route.ts        → verify OTP
      logout/route.ts
    clients/
      route.ts                   → GET list, POST create
      [id]/route.ts              → GET, PATCH, DELETE
    chat/route.ts                → SSE streaming con prompt caching
```

### Aplicar migraciones
- Helper: `node scripts/apply-sql.mjs` (modo paranoico, 17 patrones bloqueados)
- PAT en `~/.claude/.env.global`
- Project ref: pendiente de crear en Supabase (env `SUPABASE_PROJECT_REF`)
