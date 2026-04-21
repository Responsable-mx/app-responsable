// Helper GLOBAL para aplicar SQL contra cualquier proyecto Supabase vía Management API.
// Idéntico en comportamiento al helper local de s-peak-dashboard, pero vive en
// ~/.claude/scripts/ para que cualquier proyecto (actual o futuro) pueda usarlo
// sin tener que duplicar la lógica de seguridad.
//
// Uso desde la raíz de cualquier proyecto:
//   node ~/.claude/scripts/apply-sql.mjs scripts/042_xxx.sql
//   node ~/.claude/scripts/apply-sql.mjs scripts/043_xxx.sql --project=wptxyahowvgdcivuwgdi
//   node ~/.claude/scripts/apply-sql.mjs scripts/044_drop.sql --confirm-destructive
//
// Fuentes de credenciales (en orden de prioridad):
//   1) ./.env.cron               (proyecto local)
//   2) ./.env.local              (proyecto local)
//   3) ~/.claude/.env.global     (global, fallback universal)
//
// Project ref se deriva de NEXT_PUBLIC_SUPABASE_URL del proyecto (.env.local
// / .env.cron). Si el proyecto no la tiene, hay que pasar --project=<ref>.
//
// Modo paranoico SIEMPRE activo: bloquea cualquier SQL que pueda borrar/modificar
// datos o estructura existente. Ver lista completa de patrones abajo.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function loadEnv(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const args = process.argv.slice(2)
const sqlFile = args.find((a) => !a.startsWith('--'))
const projectArg = args.find((a) => a.startsWith('--project='))?.split('=')[1]

if (!sqlFile) {
  console.error('Uso: node ~/.claude/scripts/apply-sql.mjs <archivo.sql> [--project=<ref>]')
  process.exit(1)
}

if (!fs.existsSync(sqlFile)) {
  console.error(`No existe: ${sqlFile}`)
  process.exit(1)
}

const sql = fs.readFileSync(path.resolve(sqlFile), 'utf8')

// ============================================================================
// Defense-in-depth — Modo paranoico (idéntico al helper local de cada proyecto)
// ============================================================================
// Rechaza cualquier operación que pueda:
//   1) borrar o modificar datos existentes (DELETE, UPDATE, TRUNCATE, DROP)
//   2) cambiar estructura de columnas existentes (ALTER COLUMN, RENAME, DROP COLUMN)
//   3) reducir permisos o RLS (REVOKE, DROP POLICY, DISABLE ROW LEVEL SECURITY)
//   4) tener efectos cascada (CASCADE)
//
// El usuario NO es técnico — la regla es: si toca algo que existe, se bloquea.
// Solo pasan automáticamente operaciones puramente aditivas (ADD COLUMN,
// CREATE IF NOT EXISTS, CREATE OR REPLACE VIEW, GRANT, INSERT, COMMENT).
//
// Para ejecutar algo destructivo: requiere flag --confirm-destructive,
// que solo Claude debe pasar después de haber recibido OK textual del usuario
// en chat con el detalle exacto de qué se va a modificar.
// ============================================================================

// Strip comentarios (-- ... y /* ... */) antes de buscar, para no falsear con docs.
const sqlStripped = sql
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--.*$/gm, ' ')

const destructivePatterns = [
  // --- Borrado de datos ---
  { rx: /\bDELETE\s+FROM\b/i, name: 'DELETE (cualquier DELETE, con o sin WHERE)' },
  { rx: /\bTRUNCATE\b/i, name: 'TRUNCATE' },

  // --- Modificación de datos existentes ---
  { rx: /\bUPDATE\s+\w+(?:\.\w+)?\s+SET\b/i, name: 'UPDATE (cualquier UPDATE, con o sin WHERE)' },

  // --- Eliminación de objetos ---
  { rx: /\bDROP\s+(TABLE|VIEW|INDEX|SCHEMA|FUNCTION|TYPE|TRIGGER|MATERIALIZED\s+VIEW|SEQUENCE|EXTENSION)\b/i, name: 'DROP de objeto' },
  { rx: /\bALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN\b/i, name: 'ALTER TABLE ... DROP COLUMN' },
  { rx: /\bDROP\s+POLICY\b/i, name: 'DROP POLICY (RLS)' },

  // --- Cambios estructurales en columnas existentes ---
  { rx: /\bALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\b/i, name: 'ALTER COLUMN (cambio de tipo / nullability / default)' },
  { rx: /\bALTER\s+TABLE\s+\S+\s+RENAME\b/i, name: 'ALTER TABLE ... RENAME (rompe referencias del código)' },
  { rx: /\bALTER\s+\w+\s+\S+\s+RENAME\b/i, name: 'ALTER ... RENAME (rompe referencias)' },

  // --- Permisos / seguridad ---
  { rx: /\bREVOKE\b/i, name: 'REVOKE (quita permisos)' },
  { rx: /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, name: 'DISABLE ROW LEVEL SECURITY (RLS off)' },
  { rx: /\bALTER\s+TABLE\s+\S+\s+DISABLE\b/i, name: 'ALTER TABLE ... DISABLE (deshabilita constraint/trigger/RLS)' },

  // --- Blast radius amplificador ---
  { rx: /\bCASCADE\b/i, name: 'CASCADE (efectos en cadena)' },

  // --- Operaciones masivas potencialmente destructivas ---
  { rx: /\bINSERT\s+INTO\s+\S+\s*\(.*?\)\s*SELECT\b/is, name: 'INSERT ... SELECT (carga masiva, revisar volumen)' },
  { rx: /\bREINDEX\b/i, name: 'REINDEX (lock prolongado)' },
  { rx: /\bVACUUM\s+FULL\b/i, name: 'VACUUM FULL (rewrite completo, lock exclusivo)' },
]

const hits = destructivePatterns.filter((p) => p.rx.test(sqlStripped))
const confirmDestructive = args.includes('--confirm-destructive')

if (hits.length > 0 && !confirmDestructive) {
  console.error('')
  console.error('🛑 SQL POTENCIALMENTE DESTRUCTIVA — BLOQUEADA')
  console.error('')
  console.error('Modo paranoico activo. Esta SQL puede modificar o borrar')
  console.error('datos / estructura existente. Operaciones detectadas:')
  console.error('')
  for (const h of hits) console.error(`    🔸 ${h.name}`)
  console.error('')
  console.error('Para ejecutar: requiere OK explícito del usuario en chat,')
  console.error('y luego re-ejecutar con --confirm-destructive.')
  console.error('')
  console.error('Esta protección NO se puede desactivar editando el helper')
  console.error('porque hay tests automáticos que la validan.')
  process.exit(2)
}

// Cargar credenciales DESPUÉS del check destructivo, para que el security gate
// funcione incluso sin contexto de proyecto (útil para tests del propio helper).
const globalEnvPath = path.join(os.homedir(), '.claude', '.env.global')
const env = {
  ...loadEnv(globalEnvPath),
  ...loadEnv('.env.cron'),
  ...loadEnv('.env.local'),
}

const pat = env.SUPABASE_ACCESS_TOKEN
if (!pat) {
  console.error('Falta SUPABASE_ACCESS_TOKEN.')
  console.error('Buscado en (en orden):')
  console.error(`  1) ${globalEnvPath}`)
  console.error('  2) ./.env.cron')
  console.error('  3) ./.env.local')
  console.error('Crea uno en https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

let projectRef = projectArg
if (!projectRef) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const m = url?.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!m) {
    console.error('No pude derivar project ref de NEXT_PUBLIC_SUPABASE_URL.')
    console.error('Pasa --project=<ref> explícito.')
    process.exit(1)
  }
  projectRef = m[1]
}

console.log(`→ Proyecto: ${projectRef}`)
console.log(`→ Archivo:  ${sqlFile} (${sql.length} bytes)`)
if (hits.length > 0) {
  console.log(`→ ⚠ Modo destructivo confirmado: ${hits.map((h) => h.name).join(', ')}`)
}
console.log('→ Aplicando...')

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  },
)

const text = await res.text()
let body
try {
  body = JSON.parse(text)
} catch {
  body = text
}

if (!res.ok) {
  console.error(`✗ HTTP ${res.status}`)
  console.error(body)
  process.exit(1)
}

console.log('✓ Aplicado correctamente')
if (Array.isArray(body) && body.length > 0) {
  console.log('Resultado:')
  console.log(JSON.stringify(body, null, 2))
}
