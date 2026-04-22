# Últimos hallazgos — App ResponSable

Fecha: 2026-04-21
Tipo: `/audit` completa + limpieza masiva
Resultado: ✅ 0 críticos · 0 importantes inmediatos · 1 importante pendiente de OK (B1)

## Contexto

Auditoría disparada post-bootstrap. Detecté 10 hallazgos nuevos (2 críticos, 3
importantes, 5 menores) y procedí a limpiar **toda** la deuda en el mismo
barrido. Los 8 ítems que venían de DEUDA anterior (D001-D008) quedaron
completamente resueltos o absorbidos.

## Hallazgos críticos cerrados

- **A1 · Brute-force al OTP** — tabla `otp_attempts` + rate limit de intentos
  fallidos (5 / 5 min por email). Incluye IP para forense futura.
- **E1 · Prompt cache inactivo** — los 4 system prompts pasaron de ~500 a
  >3000 chars cada uno. Breakpoint único al final del prefix (`[contexto] →
  [rol + cache_control]`): cache hit completo en turnos subsecuentes de la
  misma conversación.

## Observabilidad habilitada (G1 + G2)

- Tabla `ai_calls` logueando cada llamada: tokens (input/output/cache
  creation/cache read), modelo, latencia, stop_reason, error, usuario, rol,
  cliente.
- Vistas `ai_calls_daily_by_role` y `ai_calls_daily_by_client` para métricas.
- Cron `audit-health` quincenal reporta costo estimado USD + stats.

## Pendiente

- **B1** (único pendiente) — migración `0004_clients_rls_whitelist.sql` está
  lista para aplicar. Destructiva (DROP POLICY), requiere OK textual del
  usuario + `--confirm-destructive` por modo paranoico.
- **D008** (cross-repo) — migrar `middleware.ts → proxy.ts` en `leads/` y
  `s-peak-dashboard/`. No toca App ResponSable.

## Verificación

| Check | Resultado |
|-------|-----------|
| `tsc --noEmit` | ✅ 0 errores |
| `eslint .` | ✅ 0 warnings |
| `vitest run` | ✅ 70/70 tests (+27 vs bootstrap) |
| `next build` | ✅ 15 rutas (+2 crons) |

## Siguientes pasos

1. OK explícito para aplicar `0004_clients_rls_whitelist.sql` (B1).
2. Decidir si procede D008 en los otros dos repos.
3. Configurar credenciales reales (Supabase + Resend + Anthropic) y correr
   end-to-end.
