# Deuda técnica — App ResponSable

Última revisión: 2026-04-21 (post-bootstrap)

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| Crítico   | 0        |
| Importante| 4        |
| Menor     | 2        |

## Ítems

### Importante

- **D001** — Integrar conocimiento de navegación de la app en system prompts
  de los 4 roles. Hoy los roles no saben qué vistas existen (clientes, chat,
  etc.) ni pueden redirigir al usuario. Pendiente hasta tener UI completa.
  Referencia: buena práctica #3 de S-Peak App.

- **D002** — Guided tour con driver.js para primer login (pre-piloto). Los 8
  consultores no saben qué hace cada rol. 1 hora de código, alto ROI en
  adopción. Referencia: F23 de S-Peak App.

- **D003** — Cron `daily-qa-responsable` que valide endpoints críticos y
  reporte solo fallos. Crear tras MVP con features estables. Referencia:
  `daily-qa` de S-Peak App.

- **D004** — Cron `biweekly-audit-health` (cobertura + deuda + costos API
  Anthropic). Importante porque cada conversación puede disparar 4 llamadas
  a la API; monitorear costo es crítico.

### Menor

- **D005** — Falta implementar `Cache-Control` headers en endpoints de lectura
  (`GET /api/clients` podría cachear con `s-maxage=60`). Bajo impacto con 8
  usuarios pero es la convención documentada.

- **D006** — Falta `__tests__/lib/clients.test.ts` — solo hay test de
  validación. Agregar mock de Supabase admin y cubrir list/get/create/update.
