# Últimos hallazgos — App ResponSable

Fecha: 2026-04-21
Tipo: `/audit` completa post-deploy prod + limpieza total
Resultado: ✅ 0 críticos · 0 importantes · 1 menor · 1 cross-repo · 1 operativo

## Contexto

Auditoría disparada tras poner `app.responsable.net` en producción. Detecté
10 hallazgos nuevos y procedí a cerrar todos excepto los de acción operativa
(rotación de keys = OP1) y cross-repo (D008).

## Cerrados en esta sesión

### Importantes (4)
- **H2** — +16 smoke tests UI (`ClientsList`, `ConfirmDialog`, `StringListField`)
- **H3** — Función `isDevMode()` centralizada en `lib/env.ts` (eliminados 6 duplicados)
- **H9** — Página `/configuracion/uso-ia` con métricas, top consultores, top clientes, tabla diaria
- **H10** — Rate limit 30 msgs/5min en `/api/chat` + tabla `chat_requests`

### Menores (4)
- **H5** — DEUDA.md sincronizado; B1 movido a histórico (cerrado por migración 0006)
- **H8** — Cron `audit-health` ahora envía email HTML a admins via Resend
- **H11** — `/clientes` con buscador (nombre/sector/país/marcos/certs) + filtro por sector
- **B1** — RLS whitelist ya aplicada (migración 0006 en prod)

## Migraciones nuevas aplicadas a producción

- `0015_chat_rate_limit.sql` — tabla `chat_requests` (aditiva)

## Verificación

| Check | Resultado |
|-------|-----------|
| `tsc --noEmit` | ✅ 0 errores |
| `eslint .` | ✅ 0 warnings |
| `vitest run` | ✅ **133/133** tests (+16 UI) |
| `next build` | ✅ compilado sin errores |

## Pendientes

- **R1** (menor) — Extraer subcomponentes de `CatalogsManager`/`PromptsManager`.
  Diferido hasta próximo cambio funcional.
- **D008** (cross-repo) — `middleware.ts → proxy.ts` en `leads/` y
  `s-peak-dashboard/`.
- **OP1** (operativo) — Rotar API keys Anthropic + Resend. Acción del admin.

## Siguientes pasos sugeridos

1. **OP1**: rotación de keys (5 min tuyos).
2. Cuando lleguen consultores reales, verificar `/configuracion/uso-ia` dos
   semanas después para validar costos estimados vs factura real.
3. Considerar upgrade Vercel Pro si `leads` + `app-responsable` consumen
   cuota Hobby.
