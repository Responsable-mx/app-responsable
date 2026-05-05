# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05
**Modo:** /audit completo (post-feature sprint may-2026)
**Calificación:** 6.2 / 10 (nueva deuda por sprint rápido de features)

---

## Contexto

Sprint intensivo may-2026 agregó: chat sessions persistentes, cuestionario funcional,
materialidad funcional, command palette, saved views, sparklines, logos, tab error
boundary, stream types, SWR config. La sesión anterior (2026-04-27) cerraba con 9.7/10
y cero deuda activa. El sprint añadió 22 hallazgos nuevos (4 críticos, 11 importantes, 7 menores).

D-01 y D-02 de DEUDA.md ahora resueltos (cuestionario + materialidad implementados).

---

## Hallazgos nuevos (no en DEUDA.md anterior)

### 🔴 Críticos

**D-11 · SEC** — `chat_sessions` RLS decorativa: backend usa `service_role`, bypassa RLS.
- `lib/chat-sessions.ts:37` usa `createAdminClient()`. Políticas RLS en migración 0028
  solo aplican a clientes anon/authenticated, no a service role. La separación real
  depende únicamente del filtro `.eq("user_email", userEmail)` en código, no en DB.
- Fix: comentar explícitamente en migración que isolation es server-side, o migrar a
  user-authenticated Supabase client.

**D-12 · SEC** — `materiality-topics` PATCH/DELETE sin check de ownership.
- `PATCH /api/materiality-topics/[topicId]` y `DELETE` autentican vía `requireUser()` pero
  nunca verifican que `topicId` pertenezca a un cliente del usuario. Cualquier consultor
  puede sobreescribir temas de otro cliente conociendo el UUID.
- Fix: fetch topic primero, verificar `topic.client_id` antes de patch/delete.

**D-13 · SEC/IA** — `ai-fill` `stepKey` sin sanitizar; sin scope de servicio.
- El param de URL `stepKey` no se valida contra allowlist antes de las llamadas DB.
  Con servicios múltiples futuros, un `stepKey` de servicio A puede enviarse contra
  cliente de servicio B. Comparte superficie con D-14 (sin rate limit).

**D-14 · COST/PERF** — AI fill sin rate limiting: 9 calls Anthropic por click de "Refrescar todo".
- `aiFillAll()` usa `BATCH_SIZE=3` concurrente; wizard de 9 pasos = 3 lotes. Cada call
  usa `max_tokens: 4096` + herramienta `web_search` (billable). Sin límite por usuario/hora.
- Fix: rate limit server-side (token bucket en Supabase o Redis), o al mínimo contador
  in-memory con cooldown.

---

### 🟡 Importantes

**D-15 · REL** — Autosave cuestionario: retry loop infinito en falla de red.
- `retryAttempt.current` incrementa sin tope; backoff toca 8s y queda ahí forever.
  Tab abierto de noche = cientos de POSTs fallidos silenciosos.
- Fix: límite de 5 reintentos, luego CTA "Guardar manualmente".

**D-16 · REL** — `aiFillAll` stale closure: `merged` usa `responses` de inicio del batch.
- `save(merged)` calcula `{ ...responses, ...accum }` donde `responses` es la captura
  al momento del call, no el acumulado progresivo. Si un fill individual concurrente
  modifica estado en medio del bulk, se sobreescribe.

**D-17 · REL** — Demo Altamira dispara session persist real en DB.
- La simulación de demo activa `streaming=false` → debounce de 800ms → POST a
  `/api/chat-sessions` con mensajes falsos + `clientId=ALTAMIRA_ID`.
- Fix: flag `isDemoSession`, skip persist si activo.

**D-18 · REL** — Archive en `ChatSessionsPanel` limpia chat ANTES de confirmar DELETE.
- `onArchive(id)` llama `resetChat()` inmediatamente; el `fetch DELETE` se silencia
  con `.catch(() => {})`. Si el DELETE falla, sesión reaparece en panel pero el chat
  ya fue vaciado.
- Fix: invertir orden — DELETE primero, `onArchive` solo en éxito; toast en error.

**D-19 · REL** — `loadSession` no valida shape de `messages` desde API.
- `setMessages(s.messages ?? [])` sin runtime validation. JSONB corrupto en DB
  (insert directo, seed, bug previo) crashea `ReactMarkdown` downstream sin guard.

**D-20 · REL** — `extractJsonObject` regex trunca JSON anidado en code blocks.
- Regex `/```(?:json)?\s*(\{[\s\S]*?\})\s*```/` usa `*?` non-greedy que para en
  el primer `}`, truncando objetos anidados. El balanced-brace fallback es correcto
  pero solo aplica cuando no hay code block. Resultado: JSON parcialmente parseado,
  campos `null` escritos a DB cuando el LLM sí respondió.

**D-21 · ARCH** — `isChatStreamEvent` guard no valida tipo de `text`: potencial `"...undefined"` en UI.
- Guard solo checa `type === "delta"`, no que `text` sea string.
  Si Anthropic cambia formato, `last.content + undefined` → `"...undefined"` visible.

**D-22 · ARCH** — `TEMPLATE_TOPICS` contiene 20 temas específicos de distribución en frío.
- Plantilla se inicializa para CUALQUIER cliente sin importar sector.
  Cliente de servicios financieros recibe temas de "Refrigerantes HFC" y "Bienestar animal".

**D-23 · SEC** — `users.ts` fallback silencioso a cuentas hardcodeadas si tabla vacía en producción.
- Si `authorized_users` devuelve cero filas (migración mala, wipe accidental),
  `listUsers()` retorna 3 cuentas hardcodeadas sin log ni alerta. Seguridad opaca.

**D-24 · SEC/UX** — `ClientAvatar` renderiza `<img src={logoUrl}>` sin validar URL.
- `logo_url` aceptado como cualquier string vía PATCH. Sin `https://` check.
  Sin `onError` fallback: URL rota = broken image en vez de monogram.

**D-25 · PERF** — `chat_sessions.messages` JSONB sin cap: conversaciones largas = payloads 200KB+.
- No hay `CHECK` constraint en DB ni truncado en `upsertChatSession`. Cada autosave
  (debounce 800ms) envía array completo de mensajes.

**D-26 · SEC/UX** — `SourceDrawer` acepta `javascript:` URLs en campo de fuentes.
- `handleAdd()` solo verifica string no vacío. URL se persiste y renderiza como
  `<a href={src.url} target="_blank">` en la lista — XSS potencial.

---

### 🟢 Menores

**D-27** — `ChatWindow` tiene dos funciones export (`exportConversationMd` + `exportConversation`)
  con comportamiento diferente. El botón del footer usa la versión inferior.

**D-28** — `TabErrorBoundary` expone `error.message` raw en `<details>` visible a todos los usuarios.
  En producción puede filtrar stack traces o mensajes de Anthropic API.

**D-29** — `CommandPalette` fetcha lista completa de clientes sin paginación.
  Riesgo arquitectónico si se implementa scoping por rol en el futuro.

**D-30** — Botón "Cargar plantilla" en MaterialityTab no tiene `disabled={busyInit}`;
  solo el botón de confirmación dentro del modal muestra el estado `busy`.

**D-31** — `uso-ia/page.tsx` usa `stone-*` tokens (`divide-stone-100`, `border-stone-200`)
  en código nuevo, violando el mandato `slate-*` de CLAUDE.md.

**D-32** — Migración 0028 incluye política RLS `DELETE` en `chat_sessions`.
  La app solo hace soft-archive (PATCH `archived_at`). Hard-delete vía Supabase client
  directo bypassa el patrón y elimina el audit trail.

---

## Score

| Dimensión | Antes (abr-2026) | Ahora (may-2026) |
|-----------|-----------------|-----------------|
| Seguridad | 9.5 | 4.5 |
| Confiabilidad | 9.5 | 5.5 |
| UX | 9.5 | 7.0 |
| Arquitectura | 9.5 | 6.5 |
| Rendimiento | 9.0 | 6.0 |
| Calidad de código | 9.5 | 7.5 |
| Observabilidad | 9.0 | 7.0 |
| Deuda técnica | 10.0 | 5.0 |
| **Promedio** | **9.7** | **6.2** |

La baja es esperada y normal para un sprint de features rápido.
Prioridad 1: resolver D-12 y D-26 (OWASP crítico). D-14 (costo Anthropic).

---

## Próximos /predev deben verificar

- Antes de cualquier PATCH/DELETE de recurso → check ownership explícito (client_id match)
- Antes de nuevo campo URL en UI → validar `https://` en handleAdd + en API PATCH
- Antes de nueva call Anthropic → evaluar si necesita rate limit server-side
- Antes de nueva feature chat → verificar que no persiste sesiones de demo/seed
