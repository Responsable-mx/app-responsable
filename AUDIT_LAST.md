# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-06 (sesión 15 — auditoría completa: seguridad, IA, UX, arquitectura, documentos)
**Calificación global:** 7.8 / 10

---

## Hallazgos nuevos (no en DEUDA.md al inicio de sesión)

| ID | Sev | Descripción | Archivo |
|----|-----|-------------|---------|
| D-99 | 🟡 | `as unknown as Buffer/ArrayBuffer` en parsers — mammoth y exceljs silencian errores TS | `lib/documents/parsers.ts:60,67` |
| D-100 | 🟡 | `kind` validado con array literal manual, no Zod schema — diverge de endpoints hermanos | `app/api/clients/[id]/documents/route.ts:84-86` |
| D-101 | 🟢 | Type cast innecesario en DocumentsTab fetcher — SWR infiere el tipo | `components/documents/DocumentsTab.tsx:333` |
| D-102 | 🟡 | ingest-report no verifica magic bytes — MIME spoofing posible desde servidor remoto | `app/api/clients/[id]/ingest-report/route.ts` |
| D-103 | 🟢 | `redirect: "follow"` en research-reports sin comentario de límite | `app/api/clients/[id]/research-reports/route.ts:78` |
| D-105 | 🟡 | `extractJsonObject` duplicado en 3 rutas — fix en uno no propaga | `research-reports`, `ai-fill`, `doc-fill` |
| D-106 | 🟡 | GET /documents sin check de ownership por cliente (futuro RBAC) — aceptado en MVP | `app/api/clients/[id]/documents/[docId]/route.ts:16-19` |

---

## Resueltos en este ciclo (detectados y confirmados en código)

| ID | Descripción | Estado |
|----|-------------|--------|
| D-87 | Banner cuestionario copy dinámico | ✅ `{aiCapableCount} de {totalSteps}` |
| D-88 | ADMIN label en page headers | ✅ Eliminado (h1 = "Equipo") |
| D-89 | `/configuracion` pantalla en blanco | ✅ `redirect("/configuracion/usuarios")` |
| D-90 | ACCESO RÁPIDO sidebar no navega | ✅ `<Link href="/clientes/${p.client_id}">` |
| D-91 | Roles chat IA sin descripción permanente | ✅ `{r.desc}` en ChatWindow:635 |
| D-96 | "Quitar validación" visible con 0 temas | ✅ Solo cuando `validated === total` |
| D-98 | Tablas Equipo sin zebra stripe | ✅ `even:bg-slate-50` en TeamTab + TeamOccupancy |

---

## Pendientes de ciclos anteriores (sin cambio de severidad)

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable — decisión de negocio |
| D-81 | 🟡 | Roles chat IA: hover/active indicator mejorado |
| D-82 | 🟡 | Configuración: 3 niveles nav → sidebar vertical |
| D-84 | 🟡 | Sugerencias chat genéricas — no contextuales al cliente |
| D-85 | 🟡 | ACCESO RÁPIDO: pin en lista vs sección sidebar |
| D-92 | 🟡 | Aurora sin dot ● "activo" claro en stepper |
| D-93 | 🟡 | Cronograma toolbar mezcla acciones y vistas |
| D-94 | 🟡 | Equipo: 4 filtros sin progressive disclosure |
| D-95 | 🟡 | Badge "✓ validado" redundante en secciones 100% |
| D-97 | 🟡 | Demo accounts mezcladas con consultores reales |

---

## Áreas sin hallazgos

| Área | Resultado |
|------|-----------|
| Auth routes | ✅ `requireUser`/`requireAdmin` en todos los endpoints |
| Crons (4) | ✅ `verifyCron()` + CRON_SECRET en todos |
| IA call sites | ✅ Modelos correctos, cache ephemeral, timeouts, rate limits |
| SSRF guard | ✅ RFC1918 + link-local + IPv6 ULA, 16 tests |
| Docs seguridad | ✅ MIME whitelist + 25MB cap en bucket + API + DB CHECK |
| Tests | ✅ 246 tests verde, integración real DOCX/XLSX/PPTX |
| Dead code | ✅ Sin imports huérfanos en Sprint B/C/D/E |

---

## Evolución de calificación

| Dimensión | Puntuación |
|-----------|-----------|
| Seguridad | 8.5/10 |
| Confiabilidad | 8.0/10 |
| UX | 7.0/10 |
| Arquitectura | 7.5/10 |
| Rendimiento | 8.0/10 |
| Calidad de código | 7.5/10 |
| Observabilidad | 8.5/10 |
| Deuda técnica | 7.0/10 |
| **Global** | **7.8/10** |

---

## Auditoría anterior: 2026-05-06 (sesión 14 — design critique UX)
**Calificación UX:** 6.5/10
