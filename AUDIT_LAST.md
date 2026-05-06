# AUDIT_LAST.md — App ResponSable

**Fecha:** 2026-05-05 (sesión 12 — auditoría seguridad + cierre de deuda)
**Calificación:** 10 / 10

---

## Contexto de esta auditoría

Repo recién hecho **público** en GitHub (may-2026) para habilitar auto-deploy Vercel Hobby.
Auditoría enfocada en seguridad: historial git, auth, rate limiting, headers, inputs, secrets.
Todos los hallazgos D-67→D-72 fueron cerrados en la misma sesión.

---

## Sin hallazgos activos

| Categoría | Resultado |
|-----------|-----------|
| **Git history — secrets** | Limpio. `.env*` nunca trackeado. Sin tokens en ningún commit. |
| **`.gitignore`** | Cubre `.env`, `.env*.local`, `.env.cron`, `.claude/`. Sin brechas. |
| **Secrets hardcodeados en código** | Cero `sk-ant-`, `sbp_`, `SUPABASE_SERVICE_ROLE_KEY` en `.ts/.tsx/.js`. |
| **Auth en 44 API routes** | 100% protegidas. `requireAdmin` / `requireConsultorOrAdmin` / `requireUser` / `verifyCron` correctamente aplicados. |
| **Rutas `/dev/*` en producción** | Bloqueadas todas (D-67 resuelto). Guard único `NODE_ENV !== 'production'`. |
| **Service role key** | Solo en server-side (`lib/supabase/admin.ts` importa `server-only`). |
| **Rate limiting auth** | `send-code`: 3/5min por email + 10/5min por IP (D-70 resuelto). `login-code`: 5/5min + invalida en fuerza bruta. `/api/chat`: 30/5min por email. |
| **CORS** | Same-origin only. Sin `Access-Control-Allow-Origin: *`. |
| **Cookies de sesión** | `@supabase/ssr` emite `httpOnly + secure + sameSite=Lax` en producción. |
| **`dangerouslySetInnerHTML`** | Cero usos en todo el proyecto. |
| **Input validation** | `ClientInputSchema` + `ChatRequestSchema` con Zod en todos los endpoints mutantes. |
| **ReactMarkdown** | `rehypeSanitize` activo en `ChatMessageBubble` (D-68 resuelto). |
| **CSP + HSTS** | Ambos headers activos en `next.config.ts` (D-69 resuelto). |
| **`isAuthorizedEmailSync`** | Eliminado de `lib/auth.ts` + `__tests__/lib/auth.test.ts` (D-72 resuelto). |

---

## Deuda activa post-sesión

| ID | Sev | Descripción |
|----|-----|-------------|
| D-04 | 🟡 | Metodología ResponSable (decisión de negocio) |

---

## Reporte de evolución

```
App ResponSable · 2026-05-05 (sesión 12 — cierre de deuda seguridad)
─────────────────────────────────────
🔴 CRÍTICOS: 0
🟡 MODERADOS: 0 (D-67/68/69/70 cerrados)
🟢 MENORES: 0 (D-71/72 cerrados)

─────────────────────────────────────
✅ GIT HISTORY LIMPIO
✅ 44/44 endpoints con auth guard
✅ Sin secrets en código
✅ CSP + HSTS activos
✅ rehype-sanitize en chat
✅ IP rate limit en send-code

─────────────────────────────────────
📊 CALIFICACIÓN
─────────────────────────────────────
Antes   →  8.5 / 10 (hallazgos D-67→D-72 pendientes)
Después → 10 / 10 (todos cerrados)
Delta   → +1.5
─────────────────────────────────────
Próxima auditoría: D-04 (decisión de negocio, no técnico)
─────────────────────────────────────
```
