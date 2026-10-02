#!/usr/bin/env node
/**
 * Pin del proyecto contra OneDrive Files-On-Demand — FUENTE ÚNICA (~/.claude/scripts/pin-onedrive.mjs).
 * Cada repo lleva una copia idéntica en `scripts/pin-onedrive.mjs` (corre en su pre-commit).
 * Al cambiar este archivo, re-copiarlo a los repos (ver STARTER_CI.md § OneDrive).
 *
 * Por qué existe: OneDrive puede marcar archivos como "online-only"
 * (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000). En ese estado `git status`/`ls`/`stat`
 * NO los ven (el contenido vive en la nube) pero el Read tool / Win32 API sí los hidratan →
 * si se commitea en ese estado, el archivo se "pierde" del repo sin huella en git.
 * Caso real: abr-2026, s-peak-dashboard commit 08f6c0b dejó fuera 8 archivos TS.
 *
 * `attrib +P /S /D` pinea a "always keep on this device" (idempotente, no modifica contenido).
 *
 * Velocidad (1-oct-2026): el árbol completo de leads eran ~243k archivos y el pin tardaba
 * minutos por commit. Se saltan las carpetas que NUNCA entran a un commit del repo:
 * generadas (node_modules, .next, dist, ...), .git, y .claude/worktrees (otras copias del
 * repo, cada una con su propio pre-commit). Con eso: ~19 s → ~10 s el commit completo.
 *
 *   node scripts/pin-onedrive.mjs            # pinea
 *   node scripts/pin-onedrive.mjs --check    # reporta online-only (sale 1 si hay)
 */

import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'

const ROOT = process.cwd()
const FLAG_CHECK = process.argv.includes('--check')
const FLAG_COUNT = process.argv.includes('--contar') // control: cuenta TODOS los archivos que --check recorre
const unknown = process.argv.slice(2).filter((a) => !['--check', '--contar'].includes(a))
if (unknown.length) {
  console.error(`pin-onedrive: bandera desconocida: ${unknown.join(' ')} (válidas: --check, --contar)`)
  process.exit(2)
}

// Solo aplica en Windows. En Linux/Mac/CI no hay OneDrive Files-On-Demand.
if (process.platform !== 'win32') {
  console.log('pin-onedrive: skip (no Windows, no aplica).')
  process.exit(0)
}

const SKIP = new Set([
  'node_modules', '.next', '.git', '.vercel', '.turbo', 'dist',
  'coverage', 'test-results', 'playwright-report',
])
const SKIP_CLAUDE = new Set(['worktrees'])

// Carpetas que git IGNORA nunca entran a un commit → no se pinean (1-oct-2026: en
// s-peak-dashboard, `scripts/e5-output/` ignorada tenía 19,652 de los 20,937 archivos).
// `--directory` colapsa cada carpeta ignorada a una sola línea (no baja a node_modules).
// Las carpetas IGNORADAS sí se ven aunque su contenido esté online-only: el riesgo del
// placeholder es para archivos que SÍ van al commit, y ésos nunca están aquí.
function ignoredDirs() {
  try {
    const out = execSync('git ls-files --others --ignored --exclude-standard --directory', {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    })
    return new Set(out.split(/\r?\n/).filter((l) => l.endsWith('/')).map((l) => l.slice(0, -1)))
  } catch {
    return new Set() // sin git: solo la lista fija SKIP
  }
}

// Raíces a recorrer: { path, mode }.
//   'tree'  → la carpeta entera, recursiva (no contiene nada ignorado).
//   'level' → solo las entradas DIRECTAS de la carpeta (archivos + nodos de subcarpeta),
//             una sola llamada por nivel; luego se baja a las subcarpetas limpias.
// Así cada nivel cuesta 1 proceso, no 1 por archivo (s-peak-dashboard: 25 s → ver encabezado).
function roots() {
  const ignored = ignoredDirs()
  const out = []
  const walk = (rel, depth) => {
    const abs = rel ? join(ROOT, rel) : ROOT
    out.push({ path: abs, mode: 'level' })
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      const childRel = rel ? `${rel}/${ent.name}` : ent.name
      if (depth === 0 && SKIP.has(ent.name)) continue
      if (rel === '.claude' && SKIP_CLAUDE.has(ent.name)) continue
      if (ignored.has(childRel)) continue
      const prefix = `${childRel}/`
      const hasIgnoredInside = childRel === '.claude' || [...ignored].some((d) => d.startsWith(prefix))
      if (hasIgnoredInside) walk(childRel, depth + 1)
      else out.push({ path: join(abs, ent.name), mode: 'tree' })
    }
  }
  walk('', 0)
  return out
}

if (FLAG_CHECK || FLAG_COUNT) {
  // Cuenta placeholders (0x400000) solo en las raíces que importan.
  // --contar quita el filtro de atributo: prueba que el recorrido SÍ mira archivos
  // (un 0 de --check sin este control no distingue «no hay» de «no miré»).
  const MASK = FLAG_COUNT ? '0' : '0x400000'
  const COND = FLAG_COUNT ? '$true' : `([int]$_.Attributes -band ${MASK}) -ne 0`
  const list = roots()
  const q = (r) => `'${r.path.replace(/'/g, "''")}'`
  const levels = list.filter((r) => r.mode === 'level').map(q).join(',')
  const trees = list.filter((r) => r.mode === 'tree').map(q).join(',')
  const ps = [
    '$n = 0',
    levels ? `$n += @(Get-ChildItem -LiteralPath ${levels} -File -Force -ErrorAction SilentlyContinue | Where-Object { ${COND} }).Count` : '',
    trees ? `$n += @(Get-ChildItem -LiteralPath ${trees} -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { ${COND} }).Count` : '',
    '$n',
  ].filter(Boolean).join('; ')
  const out = execSync('powershell -NoProfile -Command -', { input: ps, encoding: 'utf8' }).trim()
  const n = parseInt(out.split(/\r?\n/).pop(), 10)
  if (!Number.isFinite(n)) {
    console.error(`pin-onedrive: no pude leer el conteo de PowerShell (salida: ${out.slice(-200)})`)
    process.exit(2)
  }
  if (FLAG_COUNT) { console.log(`pin-onedrive --contar: ${n} archivos recorridos.`); process.exit(0) }
  console.log(`pin-onedrive --check: ${n} archivos en estado online-only.`)
  process.exit(n > 0 ? 1 : 0)
}

// /S = recursivo, /D = aplica a directorios también, +P = pin local
const quiet = { stdio: ['ignore', 'ignore', 'inherit'] }
console.log(`pin-onedrive: pineando ${ROOT} (sin ${[...SKIP].join(', ')}, .claude/worktrees)…`)
try {
  for (const r of roots()) {
    if (r.mode === 'tree') {
      execSync(`attrib +P "${r.path}"`, quiet)
      execSync(`attrib +P /S /D "${join(r.path, '*')}"`, quiet)
    } else {
      execSync(`attrib +P /D "${join(r.path, '*')}"`, quiet) // entradas directas, sin bajar
    }
  }
  console.log('pin-onedrive: OK.')
} catch (err) {
  console.error('pin-onedrive: error:', err.message)
  process.exit(1)
}
