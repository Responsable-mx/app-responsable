# Deuda técnica — App ResponSable

Última revisión: 2026-04-21 (post-auditoría prod-ready)

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| Crítico   | 0        |
| Importante| 0        |
| Menor     | 1        |
| Cross-repo| 1        |
| Operativo (no código) | 1 |

## Ítems

### Menor

- **R1** — Componentes de configuración con varios sub-componentes en un solo
  archivo: `CatalogsManager.tsx` (496 líneas), `PromptsManager.tsx` (416).
  Extraer a `components/config/catalogs/{Row,Editor,Panel}.tsx` y
  `components/config/prompts/{Editor,HistoryPanel}.tsx`. No bloquea nada; es
  quality-of-life para mantenimiento. Diferido hasta próximo cambio funcional
  sobre cualquiera de los dos módulos.

### Cross-repo

- **D008** — Migrar `middleware.ts → proxy.ts` en `leads/` y
  `s-peak-dashboard/` antes de subir a Next.js 17 (donde podría ser breaking).
  Actualizar `STACK_BASE.md` cuando se cierre. Pendiente de OK del usuario
  para tocar esos repos.

### Operativo

- **OP1** — Rotar `ANTHROPIC_API_KEY` y `RESEND_API_KEY` (se pegaron en chat
  durante el setup inicial de producción). Generar nuevas en cada consola,
  `vercel env add --force`, borrar las viejas. Es acción del admin, no
  trackeable como deuda de código.

---

## 📒 Historial

**Sesión 2026-04-21 — auditoría post-deploy + limpieza total:**

Cerrados 10 ítems nuevos detectados en auditoría:

| ID | Qué era | Cómo se cerró |
|----|---------|---------------|
| B1 | RLS `clients` permisiva | **Ya resuelto** por migración 0006 aplicada en prod (políticas whitelist-based contra `authorized_users.active`) |
| H2 | Cero tests de UI en componentes críticos | +16 smoke tests con @testing-library/react: `ClientsList`, `ConfirmDialog`, `StringListField`. jsdom por archivo. Suite total 133/133 |
| H3 | `isDevMode()` duplicado en 9 archivos | Extraído a `lib/env.ts`; todos los consumidores importan desde ahí |
| H5 | DEUDA.md decía B1 pendiente pero ya estaba cerrado | Actualizado a "resuelto en histórico" |
| H8 | Cron `audit-health` solo loguea | Envía email HTML a admins activos via Resend; link al panel `/configuracion/uso-ia` |
| H9 | Sin UI para ver costos/uso IA | Página nueva `/configuracion/uso-ia` con métricas, top usuarios, top clientes, tabla diaria por rol. `lib/ai/usage.ts` centraliza queries |
| H10 | `/api/chat` sin rate limit | Tabla `chat_requests` + 30 msgs/5min por email. Falla abierto si DB cae (no bloquea por bug infra). 429 con `retry-after` header |
| H11 | Lista `/clientes` sin buscador | Componente `ClientsList` con búsqueda fuzzy (nombre, sector, país, frameworks, certs) + filtro por sector. Contador "N de M" visible |

**Sesión 2026-04-21 — bootstrap + atributos + config + deploy prod:**
Cerrados 24 ítems de las auditorías previas. Ver historial en commits.
