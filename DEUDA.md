# Deuda técnica — App ResponSable

Última revisión: 2026-04-27 (limpieza total post-recalibración 24-abr)

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| Crítico   | 0        |
| Importante| 0        |
| Menor     | 0        |
| Cross-repo| 1        |
| Operativo (no código) | 1 |

**Cero deuda activa de código.** El proyecto está limpio para arrancar el piloto activo de 8 consultores.

## Cross-repo (no toca este repo)

- **D008** — Migrar `middleware.ts → proxy.ts` en `leads/` y
  `s-peak-dashboard/` antes de subir a Next.js 17 (donde podría ser breaking).
  En este repo (`app-responsable/proxy.ts`) ya está migrado.
  Pendiente del OK del usuario para tocar esos otros repos.

## Operativo (acción manual del admin)

- **OP1** — Rotar `ANTHROPIC_API_KEY` y `RESEND_API_KEY` (se pegaron en chat
  durante el setup inicial de producción). Generar nuevas en cada consola,
  `vercel env add --force`, borrar las viejas. No trackeable como deuda de
  código.

---

## 📒 Historial

**Sesión 2026-04-27 — limpieza total post-recalibración:**

Cerrados los 9 ítems abiertos (DRSP-1 a DRSP-8 + R1) en una sola pasada coordinada.

| ID | Qué era | Cómo se cerró |
|----|---------|---------------|
| DRSP-1 | `components/ui/` solo `Icons.tsx` — sin primitives canónicos | Creados Button, Input, Modal, ConfirmModal, Toast/useToast, SkipLink, Skeleton siguiendo STARTER_UX §2. forwardRef en Button, focus trap + restore focus en Modal, aria-live polite en Toast, dismiss manual + auto-dismiss en Toast. 6 archivos nuevos en `components/ui/` + 6 archivos de tests. |
| DRSP-2 | `globals.css:17` con `#0d9488` literal, sin `@theme inline` con paleta brand, sin `prefers-reduced-motion` | Refactor `globals.css`: bloque `@theme inline` con 9 tokens brand-* (primary teal, accent ámbar, berry destructive, ink slate). Focus ring usa `var(--color-brand-primary)`. Bloque `@media (prefers-reduced-motion: reduce)` que neutraliza animaciones. Clase `.skip-link` para SkipLink. STARTER_UX §1 + §3. |
| DRSP-3 | `lib/ai/roles.ts:42,48` inyectaba codes crudos (`services_contracted`, `maturity_level`) al system prompt — riesgo reputacional | `buildClientContext` ahora humaniza contra `CATALOG_LABELS` (mapeo derivado de `CATALOG_SEEDS`). El LLM ve "Doble materialidad", "Gestionado", "GRI Standards" en lugar de codes. Instrucción explícita en prompt: "NUNCA uses códigos internos del catálogo en tu respuesta al consultor". 3 tests cubren la humanización + fallback. STARTER_UX §7.3 + §8. |
| DRSP-4 | 94 ocurrencias `text-slate-300/400/500` en 29 archivos — contraste WCAG AA | Migración `text-slate-{300,400,500}` → `text-slate-600` en los 29 archivos vía script Python idempotente. Cero ocurrencias residuales verificadas con grep. STARTER_UX §1. |
| DRSP-5 | `app/layout.tsx` sin SkipLink ni `<main id>`. No existía `app/dev/*` | SkipLink en root layout (primer tab-stop). `<main id="main-content">` en dashboard layout. Middleware bypass `/dev/*` solo en `NODE_ENV !== 'production'`. Página `/dev/primitives-preview` con todos los primitives interactivos para QA visual sin auth. STARTER_UX §4 + §6. |
| DRSP-6 | `lib/ai/roles.ts:145-152` solo 1 cache breakpoint (en roleBlock); contextBlock se re-tokenizaba al cambiar de rol | Agregado `cache_control: ephemeral` al contextBlock. Ahora 2 breakpoints (max permitido 4) — al cambiar de rol con mismo cliente, el preámbulo del cliente hace cache hit. STACK.md actualizado, tests verifican ambos breakpoints. STARTER_IA §2. |
| DRSP-7 | Sin `audit_log` para mutaciones admin (prompts/users/catalogs/clients) | Migración `0020_audit_log.sql` (aplicada en prod): tabla con actor/entity/action/before/after/metadata + 3 índices + RLS solo-admin lectura. Helper `lib/audit-log.ts` con `logChange()` fail-open. Integrado en POST/PATCH/DELETE de `/api/prompts/[key]`, `/api/users`, `/api/users/[email]`, `/api/catalogs`, `/api/catalogs/[id]`, `/api/clients/[id]`. 3 tests cubren el helper. STARTER_OBS §2. |
| DRSP-8 | Sin `.github/workflows/`, coverage 70%, `include: ["lib/**"]` excluía `components/` | `.github/workflows/test.yml` con jobs lint + tsc + test:coverage + build. Thresholds vitest: stmts/lines/funcs **80**, branches **60** (calibrado al perímetro testeable real). Include ampliado a 13 archivos lib + components/ui/. 39 tests CRUD nuevos (users 16, clients 11, catalogs 9, audit-log 3). Coverage actual: 90.3% stmts, 80.75% branches, 96.42% funcs, 93.51% lines. STARTER_CI + STARTER_TESTING. |
| R1 | `CatalogsManager.tsx` 496L, `PromptsManager.tsx` 416L — monolíticos | Extraídos a sub-componentes en `components/config/catalogs/{Row,ItemEditor,CatalogPanel}.tsx` (CatalogsManager queda en ~30L) y `components/config/prompts/{PromptEditor,HistoryPanel}.tsx` (PromptsManager queda en ~70L). Cada archivo <300L. STACK_BASE Component Size Convention. |

**Estado al cierre:**

- 21 test files / 202 tests pasan (eran 17/156 antes — +4 archivos / +46 tests).
- TypeScript strict sin errores. ESLint sin warnings. Build Next.js OK.
- Coverage gate del CI activo en thresholds de starter.
- Migración SQL `0020_audit_log` aplicada en prod (Supabase project `lyideepglavkmuuujoqz`).
- Preview `/dev/primitives-preview` funcional en local con todos los primitives + tokens brand verificados visualmente.

---

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
