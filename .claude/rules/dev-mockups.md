---
paths:
  - "app/dev/**"
---

# Mockups /dev/* — playground dev

<!-- Mudado VERBATIM desde CLAUDE.md el 27-oct-2026 (carga sola al tocar los archivos de paths:). -->

## Mockups `/dev/*` — playground dev (may-2026, sesión 25)

La app real en `app.responsable.net` consume los endpoints reales:
- `/chat` → `ChatWindow` con streaming SSE de `/api/chat`
- `/clientes` → `ClientsList` con datos de `/api/clients`
- `/clientes/[id]` → `ClientTabs` con 5 tabs: Contexto + Servicios + Cuestionario (wizard AI-fill) + Materialidad (lista con X/Y) + Equipo (seniority)

Diseño corporate aplicado a `ClientTabs` (KPI cards uppercase + tabs con badges) y `ClientsList` (tabla con headers tracking-widest). Login obligatorio en raíz.

**Mockups activos en `app/dev/*`** (bloqueados en producción por `lib/supabase/middleware.ts:60-61` `NODE_ENV !== "production"`):
| Path | Propósito |
|------|-----------|
| `app/dev/app-preview/AppShell.tsx` | Mockup app shell completo (referencia diseño + ítems eliminados de la real, ej. matriz DM scatter) |
| `app/dev/clientes-wizard-preview/WizardShell.tsx` + `mock-data.ts` | Iteración wizard cuestionario sin tocar DB |
| `app/dev/chat-preview/` | Playground chat IA |
| `app/dev/client-tabs-mockup/` | Iteración layout fusionado Tier 1+2 |
| `app/dev/dm-nav-mockup/` | Iteración nav doble materialidad |
| `app/dev/primitives-preview/` | Galería primitives `components/ui/*` |

Regla: cualquier mockup `/dev/*` puede borrarse cuando deje de usarse. Si afecta dev build perf, eliminar el mockup obsoleto, no añadir build flags. NO requieren auth (middleware solo bloquea en prod).
