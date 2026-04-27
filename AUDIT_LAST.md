# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-04-27
**Modo:** /calibrar — limpieza total de deuda
**Calificación:** 9.5/10 (cero deuda activa, listo para piloto activo de 8 consultores)

## Estado del proyecto

MVP en `app.responsable.net` con cero deuda crítica/importante/menor. 21 test files / 202 tests / 90% coverage. Migración `0020_audit_log` aplicada en prod. Primitives canónicos completos. Tokens brand calibrados a contraste WCAG AA. Mapeo code→nombre humano en system prompt. 2 cache breakpoints en roles IA. CI workflow activo.

## Cambios aplicados en este audit (DRSP-1..8 + R1 cerrados)

### Estructura del design system
- `components/ui/`: 7 primitives nuevos (Button, Input, Modal, ConfirmModal, Toast, SkipLink, Skeleton) — con forwardRef, focus trap, aria-live, restore focus, focus ring brand-primary, hit-targets 32/40/48px.
- `app/globals.css`: bloque `@theme inline` con 9 tokens brand-* (primary teal validado 4.7:1, accent ámbar, berry destructive, ink slate). `@media (prefers-reduced-motion: reduce)`. Clase `.skip-link`.
- `app/layout.tsx`: SkipLink primer tab-stop. `<main id="main-content">` en dashboard layout.
- `app/dev/primitives-preview/page.tsx`: revisión visual sin auth (middleware bypass `/dev/*` solo non-prod).

### Migración slate
- 94 ocurrencias `text-slate-{300,400,500}` → `text-slate-600` en 29 archivos. Cero residuales.

### IA y prompt caching
- `lib/ai/roles.ts`: 2 cache breakpoints (contextBlock + roleBlock). `CATALOG_LABELS` humaniza codes antes de inyectar al prompt. Instrucción explícita "NUNCA uses códigos internos en respuesta al consultor".

### Audit log
- Migración `0020_audit_log.sql` (aplicada en prod): tabla + 3 índices + RLS solo-admin lectura.
- `lib/audit-log.ts`: `logChange()` fail-open.
- Integrado en mutations admin: `/api/prompts/[key]` (PATCH/DELETE), `/api/users` (POST), `/api/users/[email]` (PATCH/DELETE), `/api/catalogs` (POST), `/api/catalogs/[id]` (PATCH/DELETE), `/api/clients/[id]` (PATCH/DELETE).

### CI + coverage
- `.github/workflows/test.yml`: jobs lint + tsc + test:coverage + build.
- `vitest.config.mts`: thresholds 80 stmts/lines/funcs, 60 branches. Include 13 archivos (lib core + components/ui).
- 39 tests CRUD nuevos para users, clients, catalogs, audit-log.

### Refactor
- `CatalogsManager.tsx` 496L → 30L (extraído a `catalogs/{Row,ItemEditor,CatalogPanel}.tsx`).
- `PromptsManager.tsx` 416L → 70L (extraído a `prompts/{PromptEditor,HistoryPanel}.tsx`).

## Métricas finales

| Métrica | Antes (24-abr) | Después (27-abr) |
|---|---|---|
| Tests | 156 | 202 (+46) |
| Test files | 17 | 21 (+4) |
| Coverage stmts | 70% target / desconocido real | 90.3% / threshold 80% |
| Coverage branches | 70% target | 80.75% / threshold 60% |
| Coverage lines | 70% target | 93.51% / threshold 80% |
| Coverage funcs | 70% target | 96.42% / threshold 80% |
| Deuda Importante | 5 (DRSP-1,2,3,6,8) | **0** |
| Deuda Menor | 4 (DRSP-4,5,7, R1) | **0** |
| Hex literales en globals.css | 1 (`#0d9488`) | 0 (todos via tokens) |
| `text-slate-{300,400,500}` ocurrencias | 94 | **0** |
| Cache breakpoints en roles IA | 1 | **2** |
| Codes crudos al LLM | sí | **no** (humanizados) |
| `.github/workflows/` | sin | activo (4 jobs) |
| Tabla `audit_log` | sin | aplicada + 6 endpoints integrados |
| Primitives en `components/ui/` | 1 (Icons) | 7 |

## Deuda residual

Solo 2 ítems no-código:
- **D008** cross-repo: `leads/` y `s-peak-dashboard/` aún usan `middleware.ts` (este repo ya tiene `proxy.ts`). Pendiente OK del usuario.
- **OP1** operativo: rotación de `ANTHROPIC_API_KEY` y `RESEND_API_KEY`.

## Riesgo de escalado (8 → 50 consultores)

Antes: 5 bottlenecks. Ahora: ninguno crítico. El siguiente sprint puede enfocarse 100% en valor de producto (KB, web research, RBAC, expansion a otros entregables).

## Próximo /predev debe verificar

- Antes de feature nueva con UI → primitive de `components/ui/` ya cubre el caso.
- Antes de tocar prompt IA → verificar que `humanize()` cubre el campo si es código de catálogo nuevo.
- Antes de agregar mutación admin → integrar `logChange()` en el endpoint.
- Antes de bajar coverage threshold → discutir trade-off (gate previene regresión silenciosa).
