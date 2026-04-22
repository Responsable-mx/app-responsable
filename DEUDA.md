# Deuda técnica — App ResponSable

Última revisión: 2026-04-21 (post-cleanup)

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| Crítico   | 0        |
| Importante| 1        |
| Menor     | 0        |
| Cross-repo| 1        |

## Ítems

### Importante

- **B1** — RLS de `clients` permisiva (cualquier `authenticated` lee/escribe).
  Pendiente hasta OK del usuario porque requiere `DROP POLICY` (destructivo en
  modo paranoico). Plan: crear políticas nuevas con whitelist de emails y
  después dropear las viejas. Migración `supabase/migrations/0004_clients_rls_whitelist.sql`
  lista para aplicar. Riesgo tolerable para 8 consultores internos, pero
  defensa en profundidad apropiada para cuando expanda a clientes.

### Cross-repo

- **D008** — Migrar `middleware.ts → proxy.ts` en `leads/` y
  `s-peak-dashboard/` antes de subir a Next.js 17 (donde podría ser breaking).
  Actualizar `STACK_BASE.md` cuando se cierre. Pendiente de OK del usuario
  para tocar esos repos.

---

## 📒 Historial

**Sesión 2026-04-21 — auditoría + limpieza masiva:**

Resueltos 16 ítems en un barrido:

| ID | Qué era | Cómo se cerró |
|----|---------|---------------|
| A1 | Brute-force OTP | Tabla `otp_attempts` + rate-limit de intentos fallidos |
| E1 | Prompt cache inactivo | Prompts expandidos a >3000 chars c/u, breakpoint único al final |
| G1 | Sin observabilidad IA | Tabla `ai_calls` + vista `ai_calls_daily_by_role/client` + `lib/ai/logging.ts` |
| E2 | Sin AbortSignal | `AbortSignal.timeout(45s)` en `/api/chat` |
| E3 | Sin retry 529 | Retry único con backoff 2s ante overloaded |
| D001 | Nav en prompts | Sección `<app_navigation>` en los 4 system prompts |
| D002 | Guided tour | `components/GuidedTour.tsx` con driver.js, con data-tour tags |
| D003 | Cron daily-qa | `/api/cron/daily-qa` + vercel.json (cada día 9am) |
| D004 | Cron audit-health | `/api/cron/audit-health` + vercel.json (1 y 15 de cada mes) |
| D005 | Cache-Control | Header en `GET /api/clients` (60s + SWR 300s) |
| D006 | Tests clients | 16 tests en `__tests__/lib/clients.test.ts` |
| D007 | Duplicación dev-mode | Wrapper `withDevModeFallback<T>()` |
| F1 | Completitud cliente | Badge "N/6" en selector + banner ámbar si <6 |
| F2 | Cambio de rol silencioso | ConfirmDialog si hay mensajes |
| F3 | confirm() nativo | `components/ConfirmDialog.tsx` accesible (esc, focus) |
| G2 | Métricas por rol/cliente | Vistas SQL `ai_calls_daily_by_role/client` |
| H1 | Cobertura ~5% | 27 tests nuevos (70 total, +27): roles, auth, clients |

**Sesión 2026-04-21 — bootstrap:**

- D001-D008 originales quedaron completamente resueltos o absorbidos en los
  fixes de esta sesión.
