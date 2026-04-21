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
- [B] Documentos por cliente (PDFs, DOCX) con extracción automática
- [B] Control de acceso RBAC (admin gestiona prompts/KB/logs, consultor solo usa)
- [B] Historial de conversaciones persistido por cliente
- [B] Trazabilidad básica (log de uso por rol/usuario/fecha)
- [B] Expansión a otros entregables (propuestas, diagnósticos, reportes GRI)
- [B] Métricas de calidad (iteraciones, tiempo, score por entregable)
- [B] Integrar navegación de la app en system prompt de los 4 roles
- [B] Guided tour onboarding con driver.js para primer login
- [B] Cron `daily-qa-responsable` (operacional, solo reporta fallos)
- [B] Cron `audit-health` quincenal (cobertura + deuda + costo API)

## Futuro (Fase 3)

- [C] Generación de documentos DOCX con branding ResponSable
- [C] Generación de presentaciones PPTX con branding ResponSable
- [C] Integración Basecamp (notificaciones)
- [C] Integración Slack
