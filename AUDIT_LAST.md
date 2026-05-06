# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-06 (sesión 14 — design critique UX completo, todas las pantallas)
**Calificación UX:** 6.5 / 10 — base corporativa sólida, 3 fricciones bloqueantes en primer día de uso

---

## Hallazgos críticos pendientes (de esta auditoría)

| ID | Descripción | Prioridad |
|----|-------------|-----------|
| D-89 | Configuración abre en blanco sin contenido default | 🔴 5min |
| D-90 | ACCESO RÁPIDO sidebar no navega al hacer clic | 🔴 30min |
| D-91 | Roles Chat IA sin descripción permanente — opaco para usuarios nuevos | 🔴 20min |
| D-92 | Aurora no tiene indicador visual de "activo" en stepper | 🟡 45min |
| D-93 | Cronograma toolbar mezcla acciones y vistas | 🟡 1h |
| D-94 | Equipo: 4 filtros siempre visibles sin progressive disclosure | 🟡 1.5h |
| D-95 | Badge "✓ validado" en todos los campos de secciones 100% completas | 🟡 45min |
| D-96 | "Quitar validación" visible con 0 temas validados | 🟡 5min |
| D-97 | Cuentas Demo mezcladas con consultores reales en Equipo | 🟡 2h |
| D-98 | Tablas Equipo y Consultores sin zebra stripe | 🟢 10min |

## Pendientes de sesiones previas (no cerrados)

| ID | Descripción |
|----|-------------|
| D-81 | Roles chat IA: hover state + tooltip mejorado en avatares |
| D-82 | Configuración: sidebar nav vertical (3 niveles → 2) |
| D-84 | Sugerencias chat contextuales al cliente seleccionado |
| D-85 | ACCESO RÁPIDO: convertir a pin en lista vs sección sidebar |
| D-86 | Cronograma: eliminar h2 redundante |
| D-87 | Copy "7 pasos" vs "9 pasos" en banner cuestionario |
| D-88 | Eliminar label ADMIN en headers Equipo y Configuración |

## Lo que funciona bien (no tocar)

- Border-left semántico en cards de Resumen (4 colores)
- Skeleton loading — aparece inmediato, sin layout shift
- Narrative chip en Materialidad ("Riesgo principal: Emisiones GHG…")
- Paginación entre clientes (2/8 ← →)
- Progress badges en tabs [85/87] [4/5]
- Shape encoding ●◆■▲ en scatter plot — accesible daltónicos
- ConfirmModal en "Quitar validación" (implementado esta sesión)

---

## Auditoría anterior: 2026-05-05 (sesión 13 — auditoría IA)
**Calificación:** 10 / 10

---

## Contexto de esta auditoría

Auditoría `/audit-ia` post-seguridad. Foco: call sites Anthropic SDK, costos, cache, max_tokens, anti-alucinación.
Todos los hallazgos D-73→D-78 cerrados en la misma sesión.

---

## Sin hallazgos activos

| Categoría | Resultado |
|-----------|-----------|
| **Call sites Anthropic SDK** | 3 activos: `api/chat`, `ai-fill`, `doc-fill`, `extract-test`. Todos con timeout `AbortSignal.timeout`. |
| **Modelos** | Aurora/Rebeca=Sonnet4, Elena=Opus4 (D-75 resuelto), Valeria=Haiku4.5. Routing correcto. |
| **Cache** | 2 breakpoints ephemeral en `buildSystemBlocks`. `doc-fill` y `extract-test` añaden ephemeral (D-78 resuelto). |
| **max_tokens** | Todos calibrados: chat 1500, ai-fill 4096 (web_search extenso), doc-fill 2000 (D-77), extract-test 400. |
| **Rate limiting IA** | `ai-fill` 15/min, `doc-fill` 15/min (D-76 resuelto), `chat` 30/5min. Sin gaps. |
| **persistSession** | Fail-open correcto; catch loguea para debug prod (D-73 resuelto). |
| **Tipos beta SDK** | `cache_control`, `web_search`, cache fields — `eslint-disable` justificados (D-74 documentado). |
| **Anti-alucinación tools** | No aplica — este proyecto no usa tool-use con arrays >10 items en el chat IA. |
| **Parsing JSON LLM** | `extractJsonObject` con balanced-brace parser en `ai-fill`, `doc-fill`, `chat`. Robusto. |
| **Env vars modelos** | `ANTHROPIC_MODEL_SONNET`, `ANTHROPIC_MODEL_OPUS`, `ANTHROPIC_MODEL_HAIKU` — fallbacks hardcoded. |

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable (decisión de negocio) |

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 13 — auditoría IA)
─────────────────────────────────────
🔴 CRÍTICOS: 0
🟡 MODERADOS: 0 (D-73→D-78 cerrados)
🟢 MENORES: 0

─────────────────────────────────────
✅ D-73 — persistSession loguea errores en prod
✅ D-74 — tipos beta SDK documentados
✅ D-75 — Elena → Opus 4 (correcto para synthesis estratégica)
✅ D-76 — doc-fill rate limit 15/min igual que ai-fill
✅ D-77 — doc-fill max_tokens 4096→2000
✅ D-78 — extract-test cache_control ephemeral

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   → 10 / 10 (sesión 12, seguridad)
Después → 10 / 10 (IA limpia también)
─────────────────────────────────────
Deuda activa: D-04 (decisión de negocio, no técnico)
─────────────────────────────────────
```
