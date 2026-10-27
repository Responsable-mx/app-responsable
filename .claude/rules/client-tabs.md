---
paths:
  - "components/ClientTabs.tsx"
  - "app/(dashboard)/clientes/**"
  - "components/**/client*"
---

# ClientTabs — lazy loading + header fusionado

<!-- Mudado VERBATIM desde CLAUDE.md el 27-oct-2026 (carga sola al tocar los archivos de paths:). -->

## ClientTabs — lazy loading + header fusionado Tier 1+2 (may-2026)

**Tabs:** `Documentos` · `Cuestionario` · `DM-IA` (condicional) · `Equipo`.
- 3 tabs usan `next/dynamic` con fallback `<Skeleton>`: `QuestionnaireTab`, `TeamTab`, `DocumentsTab`. `DoubleMaterialidadTab` lazy condicional (solo si `hasDmService`).
- Tab por defecto: `cuestionario`. Persistido por cliente en `localStorage` (`client-tab-${id}`); URL `?tab=X` gana sobre storage.
- Tabs eliminadas: `Resumen` (reemplazado por strip header con KPIs), `ChatWindow`, `ClientCronogramaTab`, `MaterialityTab`. `?tab=resumen` redirige a `cuestionario` (compat URLs viejos).
- Badge Cuestionario: `${completedSteps}/${totalSteps}` (X/9 pasos individuales del wizard). Antes era `N/5` macro-grupos.
- Tab label DM-IA: acortado de "D. Materialidad IA" → "DM-IA" para ahorrar ~70px horizontal.

**Header fusionado (Variante D, may-2026):** Tier 1 (identidad) + Tier 2 (KPIs+progress) consolidados en UNA fila wrappeable dentro de `ClientTabs` (no en page.tsx). Layout izq→der:
1. Breadcrumb `← Clientes` + avatar `sm` + nombre + pill sector (color por `lib/sectors.ts`) + pill tamaño (icon edificio, violet)
2. Divider
3. KPIs **icon-only** (label en tooltip `title`): Colaboradores, Presencia, Certificación, Modelo ESG. Empty KPI (`—+`) clickeable → `jumpToStep(stepKey)` deep-link al wizard.
4. Cluster progress (`ml-auto`, `bg-slate-50 border`): count `25/87` + barra h-1 + 9 mini-dots clickeables + `%` (dropdown si tab≠cuestionario) + divider + `↻ fecha`
5. Nav prev/next (solo si >10 clientes via `showNavVisual`)
6. `<ClientHeaderActions>` — botón pencil 40×40 directo a `/editar` (admin). Atajo `E`. Exportar PDF eliminado del header (diferido).

**Helpers de limpieza KPIs (en ClientTabs):**
- `cleanCount(v)`: extrae número de strings como "3,400 colaboradores" → 3400. Evita duplicar el label.
- `cleanCert(v)`: drop prefix "Distintivo " + paréntesis explicativos. "Distintivo ESR (Empresa…) 2025" → "ESR 2025".
- `truncateByWord(s, maxLen)`: corta antes de espacio O paréntesis (evita mid-word).
- `DISCLAIMER_PREFIXES` regex: filtra "Basado en información…", "Estimado", "Sujeto a", etc. → muestra `—`.
- `fmtKpi(v)`: formato es-MX miles separator excluyendo años (1900-2099).

**Dedupe Tier 1 vs Tier 2 (page.tsx):** chips de servicios en `client.services` que ya aparecen como cert KPI son suprimidos (ej. chip "ESR" + cert "ESR 2025" → solo cert). Lógica `visibleServices` filtra contra `certsTextLower`.

**Sector pills colored:** `lib/sectors.ts` mapea ~30 sectores → clases Tailwind (energía=amber, banca=indigo, manufactura=slate, retail=pink, etc.). `sectorPillClasses(key)` normaliza accents + match parcial.

**Sticky en wizard:** `WizardStepNav` (sidebar pasos izq) + `SourceDrawer mode="panel"` (fuentes der) usan `top-[100px] z-20` para quedar bajo el header fusionado (~89px cuando wraps a 2 filas en viewport <1300px). `max-h-[calc(100vh-116px)]`.

**Patrón canónico:** `components/ClientTabs.tsx`. Page.tsx queda thin: solo data fetching + `<ClientTabs>` con props extendidos (sectorLabels, visibleServices, prev/next, counter, updatedLabel, updatedAt, metaTooltip).
