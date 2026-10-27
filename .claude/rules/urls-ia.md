---
paths:
  - "lib/**"
  - "app/api/**"
  - "components/doble-materialidad/**"
---

# URLs generadas por IA — SSRF, validateUrl, referentes

<!-- Mudado VERBATIM desde CLAUDE.md el 27-oct-2026 (carga sola al tocar los archivos de paths:). -->

## Patrón canónico — URLs generadas por IA (may-2026, actualizado)

Toda etapa DM-IA que devuelva URLs en su respuesta JSON debe aplicar este patrón. Activo en: dm-referentes, dm-benchmark-empresas.

### ⚠️ NO usar validateUrl() para URLs de IA

`validateUrl()` (HEAD/GET con user-agent de bot) es bloqueado por los CDNs corporativos de empresas grandes (BP, Iberdrola, Pemex, SASB, GRI, etc.) aunque la URL sea correcta. Caso confirmado may-2026: las 3 empresas más grandes del benchmark tenían URL correcta pero `validateUrl` las descartaba. **`validateUrl` eliminada de ambos routes.**

**Regla:** para URLs aportadas por la IA (JSON de generate, web_search, o conocimiento de entrenamiento) → solo aplicar `isPublicHttpUrl()` (SSRF guard). No hacer fetch de validación.

### Server-side: solo SSRF guard

```typescript
import { isPublicHttpUrl } from "@/lib/documents/ssrf";

// Después de validar el schema IA:
const items = rawItems.map((item) => {
  if (!item.url) return item;
  return isPublicHttpUrl(item.url).ok ? item : { ...item, url: null };
});
```

- `isPublicHttpUrl` bloquea: localhost, RFC1918, link-local, IPv6 ULA, IPv4-mapped (`::ffff:*`)
- No hacer `fetch()` de validación — CDNs bloquean bots aunque la URL sea real
- URLs de IA son confiables para empresas conocidas; URLs hallucinated son raras y detectables en UI

### validateUrl() — cuándo SÍ usarla

Solo para URLs ingresadas por el usuario (no generadas por IA) donde se sospecha typo o URL incorrecta, y el dominio objetivo es probablemente un sitio pequeño sin CDN corporativo. Ejemplo: `ingest-report` donde el consultor pega una URL de informe.

### dm-referentes: URLs canónicas hardcoded (may-2026)

Para frameworks ESG conocidos, `search_urls` usa un mapa hardcoded antes de llamar a la IA.
Razón: LLMs memorizan URLs desactualizadas (caso confirmado: IPIECA URL incorrecta). Hardcoded = siempre correcto.

Frameworks en el mapa (actualizar si cambian sus URLs):
`GRI · SASB · ESRS · TCFD · CDP · IPIECA · PRI · GRESB · GCCA · ISO26000 · GHG · SBTI · CSRD · TNFD · SDG`

Para frameworks fuera del mapa → Aurora + `web_search_20250305` (fallback, mismo patrón que dm-benchmark-empresas).

### dm-benchmark-empresas: forzar web_search (may-2026)

El prompt de `search_urls` incluye "MANDATORY: call web_search before submit_url" para evitar `usedWebSearch=false`.
Síntoma sin este fix: modelo responde con URL de conocimiento de entrenamiento sin buscar → URL puede ser desactualizada.

### Client-side: indicar ausencia de URL

Cuando `url === null`, mostrar nudge "Sin URL verificada" en lugar de silencio:

```tsx
{item.url ? (
  <a href={item.url} target="_blank" rel="noopener noreferrer">Ver →</a>
) : (
  <span title="La IA no pudo verificar la URL. Agrega manualmente si la conoces."
        className="inline-flex items-center gap-1 text-[10px] text-slate-400 italic">
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
    Sin URL verificada
  </span>
)}
```

- Company cards: nudge clickeable → editor inline URL (implementado en `ReferentesSection.tsx`)
- Framework cards: span no-interactivo es suficiente (la mayoría ya tienen URL del mapa hardcoded)
