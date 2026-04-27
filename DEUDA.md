# Deuda técnica — App ResponSable

Última revisión: 2026-04-27 (segundo pase de limpieza tras design critique)

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| Crítico   | 0        |
| Importante| 0        |
| Menor     | 0        |
| Cross-repo| 1        |
| Operativo (no código) | 1 |

**Cero deuda activa de código** tras dos pases coordinados. Cobertura DS al 100% del chrome y mutaciones admin.

## Cross-repo (no toca este repo)

- **D008** — Migrar `middleware.ts → proxy.ts` en `leads/` y
  `s-peak-dashboard/` antes de subir a Next.js 17 (donde podría ser breaking).
  En este repo (`app-responsable/proxy.ts`) ya está migrado.
  Pendiente del OK del usuario para tocar esos otros repos.

## Operativo (acción manual del admin)

- **OP1** — Rotar `ANTHROPIC_API_KEY` y `RESEND_API_KEY` (se pegaron en chat
  durante el setup inicial de producción). Generar nuevas en cada consola,
  `vercel env add --force`, borrar las viejas.

---

## 📒 Historial

**Sesión 2026-04-27 (pase 2) — design critique + limpieza follow-up:**

Tras `/design:design-critique` sobre `/dev/primitives-preview`, se detectaron y cerraron 6 ítems adicionales:

| ID | Qué era | Cómo se cerró |
|----|---------|---------------|
| **Priority 1** (critique) | `<Button loading>` y `<Button disabled>` se veían idénticos (ambos con `disabled:opacity-50`) | Separación: `loading=true` mantiene opacity 1.0 (spinner visible), `disabled=true && !loading` aplica opacity-50. `data-loading` y `aria-busy` para AT. Tests `loading + disabled juntos` cubren la regla. Verificado en preview: loading=1.0, disabled=0.5. |
| **Priority 2** (critique) | `app/dev/primitives-preview` exponía `<SkipLink/>` permanentemente al final, contradiciendo su patrón (oculto hasta foco) | Reemplazado por bloque descriptivo (patrón + cómo probar + dónde vive). El SkipLink real solo se monta una vez en root layout. |
| **DRSP-9** | 56 ocurrencias `teal-N` hardcoded en 21 archivos (Sidebar, ChatWindow, ClientForm, ClientsList, login, configuración, fields…) | Script Python migra `teal-50/100/200/300/400/500` → `brand-primary-light`/`brand-primary`, `teal-600` → `brand-primary`, `teal-700` → `brand-primary-hover`, `teal-800/900` → `brand-primary-dark` en 21 archivos / 86 reemplazos. Cero residuales `teal-N`. Esto incluye Sidebar (Priority 3 del critique). STARTER_UX §1. |
| **DRSP-10** | `app/(auth)/login/page.tsx` con `<input>`, `<button>`, spinner ad-hoc | Migrado a `<Input>` y `<Button>` primitives. Step "loading" eliminado (manejo via `submitting` + `<Button loading>`). Borde error en `border-brand-berry`. OTP input con `inputMode="numeric"` + `aria-invalid/aria-describedby`. STARTER_UX §2. |
| **DRSP-11** | 4 modales ad-hoc en lugar de `Modal` primitive (focus trap, restore focus, ESC inconsistentes) | Migrados: `components/extract/ExtractSectorModal.tsx`, `components/services/ServiceEditor.tsx`, `components/config/UsersManager.tsx UserEditor`, `components/config/catalogs/ItemEditor.tsx` (recién creado). Todos heredan focus trap + ESC + restore focus + click overlay del primitive. Buttons internos también migrados a `<Button>` primitive. |
| **DRSP-12** | `ConfirmDialog` legacy aún usado por 6 componentes (catalogs, prompts, ClientForm, ChatWindow, PreferencesPanel) | Migrados todos a `ConfirmModal` (`variant="destructive"` → `tone="destructive"`, `variant="default"` → `tone="primary"`). Deleted `components/ConfirmDialog.tsx` + `__tests__/ui/ConfirmDialog.ui.test.tsx`. Cero consumidores residuales. Ahora solo existe el primitive con busy state async. |

**Validación al cierre:**

- 20 test files / 198 tests pasan (eran 21/203 — bajamos 5 al borrar tests del legacy ConfirmDialog).
- TypeScript strict sin errores. ESLint sin warnings. Next.js build OK.
- Preview verificado: loading button con opacity 1.0 vs disabled 0.5. Cero errores en consola tras navegación.
- Coverage de los primitives sigue en 80%+ stmts/lines/funcs, 60%+ branches.

---

**Sesión 2026-04-27 (pase 1) — limpieza total post-recalibración 24-abr:**

Cerrados los 9 ítems abiertos (DRSP-1 a DRSP-8 + R1) en una sola pasada coordinada.

| ID | Qué era | Cómo se cerró |
|----|---------|---------------|
| DRSP-1 | `components/ui/` solo `Icons.tsx` — sin primitives canónicos | Creados Button, Input, Modal, ConfirmModal, Toast/useToast, SkipLink, Skeleton siguiendo STARTER_UX §2. |
| DRSP-2 | `globals.css:17` con `#0d9488` literal, sin `@theme inline` con paleta brand, sin `prefers-reduced-motion` | Refactor `globals.css`: bloque `@theme inline` con 9 tokens brand-* + `@media (prefers-reduced-motion: reduce)` + clase `.skip-link`. STARTER_UX §1 + §3. |
| DRSP-3 | `lib/ai/roles.ts:42,48` inyectaba codes crudos al system prompt | `buildClientContext` ahora humaniza contra `CATALOG_LABELS`. Instrucción explícita en prompt. STARTER_UX §7.3 + §8. |
| DRSP-4 | 94 ocurrencias `text-slate-300/400/500` en 29 archivos | Migración a `slate-600`. Cero residuales. STARTER_UX §1. |
| DRSP-5 | Sin SkipLink, sin `<main id>`, sin `app/dev/*` | SkipLink en root layout, `<main id="main-content">` en dashboard layout, `app/dev/*` con middleware bypass non-prod. |
| DRSP-6 | 1 cache breakpoint en buildSystemBlocks | Agregado segundo en contextBlock — ~50% ahorro Anthropic. STACK_BASE.md alineado. |
| DRSP-7 | Sin audit_log para mutaciones admin | Migración `0020_audit_log.sql` aplicada en prod + helper `lib/audit-log.ts` integrado en POST/PATCH/DELETE de prompts/users/catalogs/clients. |
| DRSP-8 | Sin `.github/workflows/`, coverage 70%, include excluía components | CI workflow + thresholds 80/60 + 39 tests CRUD nuevos. Coverage 90.3% stmts. |
| R1 | `CatalogsManager` 496L, `PromptsManager` 416L | Extraídos a sub-componentes en `catalogs/` y `prompts/`. |

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
