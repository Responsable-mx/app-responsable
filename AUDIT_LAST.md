# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-04-24
**Modo:** /calibrar (recalibración vs starters globales actualizados)
**Calificación:** 8.0/10 (MVP en prod sin bloqueos, gaps a11y/IA antes de piloto activo)

## Estado del proyecto

MVP funcional desplegado en `app.responsable.net`. 4 roles IA, RLS, rate limit, página `/configuracion/uso-ia`, 133 tests, 0 deuda crítica previa. Piloto inminente con 8 consultores.

## Top hallazgos (5 importantes pre-piloto)

1. **DRSP-1** — Primitives canonicos faltantes (`components/ui/` solo tiene Icons). Sin Button/Input/Modal/Toast/SkipLink/Skeleton. ~1 día.
2. **DRSP-2** — `globals.css` con hex hardcoded, sin tokens, sin `prefers-reduced-motion`. 1-2h.
3. **DRSP-3** — Codes crudos `services_contracted`/`maturity_level` filtrados al LLM en respuesta al consultor. Riesgo reputacional. 1-2h.
4. **DRSP-6** — Solo 1 cache breakpoint cuando STACK declara 2. Costo Anthropic ~2x al cambiar de rol. 15min (XS).
5. **DRSP-8** — Sin CI workflow, sin Playwright, coverage threshold bajo. Moderado.

## Menores (cleanup gradual)

- DRSP-4: 69 usos slate-400/500 (contraste).
- DRSP-5: Sin SkipLink, sin app/dev/* previews.
- DRSP-7: Sin audit_log para mutaciones admin.
- R1: CatalogsManager/PromptsManager monolíticos.

## Recomendación concreta

**Antes de que arranquen los 8 consultores en piloto activo:** invertir 1-2 días en DRSP-1 (primitives) + DRSP-2 (tokens) + DRSP-3 (codes LLM-only) + DRSP-6 (2do cache breakpoint). ROI alto: paleta consistente, sin leak de jerga al cliente, ahorro inmediato en tokens.

DRSP-7 (audit_log) y DRSP-8 (CI) pueden esperar a los siguientes 20+ usuarios.

## Riesgo de escalado (8 → 50 consultores)

Bottleneck será UX/mantenibilidad, no infra. Concreto:
1. **Primitives ausentes** → drift visual + regresiones a11y por feature (DRSP-1).
2. **Codes crudos en respuesta IA** → leak a clientes corporativos premium (DRSP-3).
3. **Sin Playwright ni CI** → cambios al chat rompen en prod sin alerta (DRSP-8).
4. **1 solo cache breakpoint** → costo Anthropic se dispara con volumen (DRSP-6).
5. **Pregunta abierta:** ¿RLS lax intencional con datos ESG empresariales sensibles? Revisar antes de prospecto corporativo.

## Próximo /predev debe verificar

- Antes de feature nueva con UI → ¿el primitive existe? Si no, crearlo primero (Button, Input, Modal, etc.)
- Antes de tocar prompt IA → ¿hay codes que el LLM pueda repetir literal? Mapear a nombre humano o instruir "no citar literal".
- Antes de agregar tabla → aplicar STARTER_UX §7 (8 principios) desde día 1 + §7.1 banner jerárquico si consolida datos.

## Cambios aplicados en este audit

- DEUDA.md: agregados DRSP-1 a DRSP-8 (5 importantes + 4 menores). R1 conservado.
- CLAUDE.md: bloque "Reglas de UX/a11y" + decisión explícita §7.3 sobre codes internos + lista de primitives a crear con orden estricto.
