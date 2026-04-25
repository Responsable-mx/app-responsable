# App ResponSable

Sistema conversacional con IA y cadena de calidad por roles para consultoría en sostenibilidad.

## Descripcion

App web interna para el equipo de consultoría de ResponSable. Cuatro asistentes IA especializados (Aurora, Rebeca, Elena, Valeria) que operan como cadena de calidad escalonada sobre entregables de consultoría, empezando por Estudios de Doble Materialidad.

## Usuarios finales

- Internos: 8 consultores (MVP), expandible a ~20 (marketing, talento)
- Futuros: clientes corporativos (post-piloto)

## Roles IA (cadena de calidad)

| Rol | Nombre | Funcion |
|-----|--------|---------|
| Autor | Aurora | Construye borrador alineado a metodologia y estandares internos |
| Revisor | Rebeca | Detecta fallas, omisiones, riesgos. Checklist y rubrica |
| Elevador | Elena | Insights, trade-offs, narrativa, recomendaciones estrategicas |
| Validador | Valeria | Verifica Definition of Done, consistencia, evidencia, trazabilidad |

Flujo: secuencial sugerido (Aurora -> Rebeca -> Elena -> Valeria), no obligatorio.


## Contexto de auditoría
- Deuda técnica acumulada → ver DEUDA.md
- Últimos hallazgos críticos → ver AUDIT_LAST.md
- Si DEUDA.md no existe → crearlo al completar la primera auditoría

## Stack

- Stack base: ver `~/.claude/STACK_BASE.md`
- Diferencias con base: ver `STACK.md`

## Piloto

- Entregable: Estudio de Doble Materialidad
- Usuarios piloto: equipo de consultoria (8 personas)

## AI / Prompts
- Convenciones de prompt engineering y model selection: ver `~/.claude/STACK_BASE.md` (seccion AI / Prompt Engineering)

## MVP

1. Chat con 4 roles IA (Aurora/Rebeca/Elena/Valeria) con flujo secuencial sugerido

## Reglas de UX/a11y (post-recalibración 24-abr-2026)

- **Contraste:** body text ≥slate-700, helper/subtitle ≥slate-600. Nunca slate-300/400/500 para contenido.
- **Focus ring:** brand-primary (teal ResponSable), nunca accent puro sobre blanco.
- **Touch targets:** botones e iconos ≥40px (ideal 44px WCAG AAA).
- **Skeleton vs spinner (binario):** datos=Skeleton, acción del usuario=spinner inline en botón.
- **Feedback async:** `useToast` + `ConfirmModal`. NUNCA `window.confirm`, `setTimeout` banners, ni silent catches.
- **prefers-reduced-motion:** automático vía globals.css.
- **aria-live:** chat stream, SWR refetch, loading states con `role="log"` o `role="status"` `aria-live="polite"`.
- **Spanish convention:** copy UI en español de México (tú, no vos). Sin anglicismos.
- **Dev preview pattern:** `app/dev/<feature>-preview/page.tsx` con mocks + middleware bypass non-prod.
- **Tablas (8 principios STARTER_UX §7):** `min-w-full w-max` (no `w-full`), `overflow-x-auto` wrapper, sticky header, zebra, hover, `tabular-nums`, signal-over-noise + banner jerárquico §7.1.
- **Códigos de catálogo upstream NO en UI:** mapear a nombres humanos antes del render. **Códigos LLM-only**: si el LLM necesita el código para razonar (ej. `services_contracted`, `maturity_level`), pasarlo en data structurada con instrucción explícita "no repetir literal en respuesta al usuario".

## Decisión §7.3 — codes internos del cliente

`services_contracted` y `maturity_level` (`lib/ai/roles.ts:42,48`) son **metadato LLM-only**:
- Pasar al system prompt para que la IA razone sobre el contexto del cliente.
- Instruir explícitamente en el prompt: "Estos códigos son contexto interno; NO los menciones literal en tu respuesta. Cuando hables del nivel de madurez o servicios contratados, usa lenguaje natural".
- En UI mostrar nombre humano: "Madurez: Gestionado · Servicios: Doble Materialidad, GRI" (con label legible y mapeo desde catálogos).
- Audit DRSP-3 documenta el fix exacto.

## Primitives a crear (orden estricto)

Un PR = un primitive + tests. Orden de DRSP-1:

1. `components/ui/Button.tsx` — forwardRef, variants primary/secondary/ghost/destructive, size sm/md/lg, prop `loading`.
2. `components/ui/Input.tsx` — `aria-invalid` + `aria-describedby` automáticos.
3. `components/ui/Modal.tsx` — `role="dialog" aria-modal`, focus trap, restore focus, ESC cierra.
4. `components/ui/ConfirmModal.tsx` — wrapper Modal con tone destructive y estado `busy` async. Reemplaza `ConfirmDialog`.
5. `components/ui/Toast.tsx` + `useToast` — `aria-live="polite"`, dismiss manual.
6. `components/ui/SkipLink.tsx` — primer tabbable, target = `<main id="main-content">`.
7. `components/ui/Skeleton.tsx` — variantes Card/List/Detail/Table/Dashboard.

Copiar de `s-peak-dashboard/components/ui/` adaptando paleta a brand-primary teal de ResponSable.
