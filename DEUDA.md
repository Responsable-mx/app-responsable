# Deuda técnica — App ResponSable

Última revisión: 2026-04-24 (recalibración vs starters globales actualizados)

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| Crítico   | 0        |
| Importante| 5        |
| Menor     | 4        |
| Cross-repo| 1        |
| Operativo (no código) | 1 |

## Ítems

### Importantes (resolver antes de piloto activo con 8 consultores)

- **DRSP-1** — `components/ui/` solo tiene `Icons.tsx` — faltan primitives canónicos:
  Button, Input, Modal, Toast/useToast, SkipLink, Skeleton. `ConfirmDialog` en
  `components/` no cumple §2 (sin focus trap Tab/Shift+Tab, sin restore focus,
  solo ESC). STARTER_UX §2.
  Tipo: Arquitectural · Hito: pre-piloto activo · Complejidad: Moderado (~1 día)

- **DRSP-2** — `app/globals.css:16-17` usa hex `#0d9488` en vez de token
  `--color-brand-primary`. No hay bloque `@theme inline` con paleta ResponSable.
  Falta `@media (prefers-reduced-motion: reduce)`. STARTER_UX §1 + §3.
  Tipo: Arquitectural · Hito: pre-piloto activo · Complejidad: Simple (1-2h)

- **DRSP-3** — `lib/ai/roles.ts:42,48` inyecta códigos internos crudos en el
  system prompt (`services_contracted`, `maturity_level: "gestionado"`). El LLM
  los reproduce literal en respuesta al consultor → riesgo reputacional con
  clientes corporativos premium. STARTER_UX §7.3 + §8: codes son metadato
  LLM-only — el consultor ve nombre humano en UI, el LLM recibe el código como
  dato pero con instrucción "no repetir literal en respuesta".
  Tipo: Arquitectural · Hito: pre-piloto activo · Complejidad: Simple (1-2h)

- **DRSP-6** — `lib/ai/roles.ts:145-152` usa solo 1 cache breakpoint (en
  roleBlock). STACK.md declara "2 breakpoints: contexto cliente + rol". Al
  cambiar de rol con mismo cliente, el preámbulo de cliente (potencialmente
  >1KB con 6 bloques narrativos JSONB) se re-tokeniza sin cache. Costo Anthropic
  ~2x al usar Sonnet × 3 roles para volumen alto. Agregar `cache_control:
  {type: 'ephemeral'}` al contextBlock. STARTER_IA §2.
  Tipo: Arquitectural · Hito: pre-piloto activo · Complejidad: XS (15min)

- **DRSP-8** — No existe `.github/workflows/`. No hay Playwright (`e2e/`
  ausente). Coverage threshold 70% (starter pide 80 lines/stmts/funcs, 65
  branches). `include: ["lib/**/*.ts"]` excluye `components/` — los 16 smoke
  tests UI no cuentan en el gate. STARTER_CI §1+§2 + STARTER_TESTING.
  Tipo: Arquitectural · Hito: antes de escalar de 8 a 20 consultores · Complejidad: Moderado

### Menor

- **DRSP-4** — 69 usos de `text-slate-400/500` en 19 componentes. `slate-500`
  ratio 4.79:1 OK helper, `slate-400` 3.1:1 solo decorativo. Auditar y migrar
  body/helper text a `slate-600+`. STARTER_UX §1.
  Tipo: Accidental · Hito: cleanup gradual · Complejidad: Moderado

- **DRSP-5** — `app/layout.tsx:21-27` sin `<SkipLink>` ni
  `<main id="main-content">`. Dashboard layout tiene `<main>` pero sin id. No
  hay `app/dev/*` previews — nada permite validar UI sin auth. STARTER_UX §4 + §6.
  Tipo: Accidental · Hito: pre-piloto · Complejidad: Simple

- **DRSP-7** — `ai_calls` logea bien (§10), pero no hay `audit_log` dedicado
  para mutaciones admin (edición de prompts, usuarios, catálogos, client edits).
  Mutaciones en `/api/prompts`, `/api/users`, `/api/catalogs`, `/api/clients/[id]`
  deberían loguear `logChange()`. STARTER_OBS §2.
  Tipo: Arquitectural · Hito: antes de escalar a clientes corporativos · Complejidad: Moderado

- **R1** — Componentes de configuración con varios sub-componentes en un solo
  archivo: `CatalogsManager.tsx` (496 líneas), `PromptsManager.tsx` (416).
  Extraer a `components/config/catalogs/{Row,Editor,Panel}.tsx` y
  `components/config/prompts/{Editor,HistoryPanel}.tsx`. Diferido hasta próximo
  cambio funcional sobre cualquiera de los dos módulos.

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
