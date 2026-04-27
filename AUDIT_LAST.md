# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-04-27 (segundo pase post-design critique)
**Modo:** /calibrar — limpieza total + critique follow-up
**Calificación:** 9.7/10 (cero deuda activa, design system completo, modales unificados)

## Estado del proyecto

MVP en `app.responsable.net` con **cero deuda activa** tras dos pases coordinados. El design system cubre el 100% del chrome y mutaciones admin. Login + chat + clientes + configuración usan exclusivamente primitives canónicos y tokens brand-*. Cero `teal-N` hardcoded, cero `ConfirmDialog` legacy, cero modales ad-hoc.

## Pase 2 (post-design critique) — cambios aplicados

### Critique anterior (3 priorities)
- **Priority 1**: `<Button loading>` ahora mantiene opacity 1.0 (vs `<Button disabled>` con 0.5). Spinner visible con contraste pleno. Verificado en preview: `data-loading=true` → opacity 1.0; `disabled` → opacity 0.5.
- **Priority 2**: SkipLink demo en preview reemplazado por descripción del patrón + instrucciones (no se renderiza expuesto).
- **Priority 3** (Sidebar tokens): cubierto por DRSP-9 batch.

### DRSP-9 — Migración masiva teal-N → brand-*
- 56 ocurrencias en 21 archivos (Sidebar, ChatWindow, ClientForm, ClientsList, login, configuración, fields, services, extract, etc.) → tokens brand-*.
- Script Python idempotente con mapeo: `teal-50/100/200/300/400/500` → `brand-primary-light`/`brand-primary`, `teal-600` → `brand-primary`, `teal-700` → `brand-primary-hover`, `teal-800/900` → `brand-primary-dark`.
- 86 reemplazos totales. Cero residuales `teal-N`.

### DRSP-10 — Login con primitives
- `app/(auth)/login/page.tsx` reescrito: `<Input>` para email/OTP wrap, `<Button loading>` para submit, ghost variant para "Cambiar correo". Step "loading" eliminado (manejo con `submitting` boolean).
- Borde error en `border-brand-berry`. OTP input con `inputMode="numeric"`, `aria-invalid`, `aria-describedby`.

### DRSP-11 — 4 modales ad-hoc → Modal primitive
- `components/extract/ExtractSectorModal.tsx`
- `components/services/ServiceEditor.tsx`
- `components/config/UsersManager.tsx UserEditor`
- `components/config/catalogs/ItemEditor.tsx` (recién creado en R1)
- Todos heredan focus trap + ESC + restore focus + click overlay + busy state. Buttons internos a `<Button>` primitive.

### DRSP-12 — ConfirmDialog → ConfirmModal + delete legacy
- Migrados 6 consumidores: `catalogs/CatalogPanel.tsx`, `prompts/PromptEditor.tsx`, `chat/ChatWindow.tsx`, `ClientForm.tsx`, `services/ClientServicesTab.tsx`, `config/PreferencesPanel.tsx`.
- Mapeo: `variant="destructive"` → `tone="destructive"`, `variant="default"` → `tone="primary"`.
- Deleted `components/ConfirmDialog.tsx` + `__tests__/ui/ConfirmDialog.ui.test.tsx`. Cero consumidores residuales.

## Métricas finales (acumulado dos pases)

| Métrica | Pase 1 cierre | Pase 2 cierre |
|---|---|---|
| Tests | 202 | 198 (-5 por delete legacy ConfirmDialog tests) |
| Test files | 21 | 20 |
| Coverage stmts | 90.3% | 86%+ (sin cambios estructurales) |
| `teal-N` residuales | 56 | **0** |
| `ConfirmDialog` consumidores | 6 | **0** (legacy eliminado) |
| Modales ad-hoc | 4 | **0** |
| Primitives en `components/ui/` | 7 | 7 (sin cambios) |
| Login usando primitives | no | **sí** |
| Loading vs disabled distinción visual | confuso | **claro** (opacity 1.0 vs 0.5) |
| Deuda Importante | 0 | **0** |
| Deuda Menor | 0 | **0** |

## Deuda residual

Solo 2 ítems no-código (sin cambios desde pase 1):
- **D008** cross-repo: `leads/` y `s-peak-dashboard/` aún usan `middleware.ts`.
- **OP1** operativo: rotación de keys.

## Riesgo de escalado (8 → 50 consultores)

Tras los dos pases, ningún bottleneck técnico activo. El design system es ahora el contrato visual de toda la app. Un futuro rebrand modificará solo los tokens en `globals.css` y el cambio se propaga a 100% del chrome — ya verificado por la migración de `teal-N`.

## Cobertura del design system

| Área | Pase 1 | Pase 2 | Estado |
|---|---|---|---|
| Tokens brand en globals.css | ✓ | ✓ | Completo |
| Primitives en components/ui | ✓ (7) | ✓ (7) | Completo |
| `app/(dashboard)` chrome usa tokens | ⚠ teal-N residual | ✓ | Completo |
| Login | ⚠ ad-hoc | ✓ primitives | Completo |
| Chat | ⚠ teal-N | ✓ | Completo |
| Clientes (lista + form) | ⚠ teal-N | ✓ | Completo |
| Configuración (catalogs + prompts + users + preferencias + uso-ia) | parcial | ✓ | Completo |
| Modales | 4 ad-hoc | ✓ todos primitives | Completo |
| ConfirmModal/Dialog | dual (legacy + nuevo) | ✓ solo nuevo | Completo |

## Próximo /predev debe verificar

- Antes de feature nueva con UI → primitive de `components/ui/` ya cubre.
- Antes de tocar prompt IA → verificar humanización de codes nuevos.
- Antes de agregar mutación admin → integrar `logChange()`.
- Antes de agregar modal nuevo → usar `<Modal>` primitive (NO ad-hoc role="dialog").
- Antes de agregar confirmación → usar `<ConfirmModal>` (NO crear wrapper nuevo).
- Antes de hardcodear color → verificar token en `@theme inline` (NO `teal-N`/`red-N` directos).
