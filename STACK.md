# Stack — App ResponSable

Stack base: `~/.claude/STACK_BASE.md`. Solo se documenta aqui lo diferente.

## Diferencias con STACK_BASE

### IA
- Claude API (Anthropic SDK) con 4 system prompts especializados por rol
- Modelos: Sonnet 4.6 (Aurora, Rebeca, Elena), Haiku 4.5 (Valeria)
- Streaming SSE token-por-token

### Knowledge Base (Fase 2)
- OneDrive como fuente de verdad (Microsoft Graph API para sync)
- pgvector en Supabase para embeddings/busqueda semantica
- Embeddings: text-embedding-3-small o voyage-3
- Chunking: 1000 tokens, overlap 200

### Web Research (Fase 2)
- Brave Search API (2k queries/mes gratis)
- Proteccion: nunca incluir contexto de KB interna en queries externas

### Auth
- Supabase OTP email + invitacion
- RBAC: admin (gestiona prompts, KB, logs) / consultor (solo usa roles)

### Arquitectura de decisiones
- Auth: invitacion (OTP email)
- Roles: RBAC (admin/consultor)
- Archivos: OneDrive (existente) + S3/R2 si escala a videos
- Externos: Claude API (IA) + Microsoft Graph (OneDrive) + Brave Search (web research)

### Pendientes
- [pendiente] Esquema de base de datos
- [pendiente] Estructura de rutas
- [pendiente] System prompts de cada rol
