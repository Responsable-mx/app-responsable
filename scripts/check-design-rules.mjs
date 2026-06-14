#!/usr/bin/env node
// Gate de reglas de diseño para app-responsable — garantía [1] (mecánica) de las
// reglas objetivas de UI. Espejo del gate global ~/.claude/scripts/check-design-rules.mjs
// (vive EN el repo para que CI/build/pre-commit lo tengan).
//
// Config: .design-rules.json (brandHexes, scanDirs, skipFiles).
// Uso:    npm run check:design   ·   node scripts/check-design-rules.mjs --json
//
// Reglas ERROR: R1 hex de marca inline · R2 grid-cols>=3 sin breakpoint · R3 backlink inline.
// Regla  WARN:  W1 touch target <44px.
// Nota: R1 requiere brandHexes en .design-rules.json (sacarlos de app/globals.css @theme).

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, sep, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=').replace(/^["']|["']$/g, '') : def
}
const ROOT = resolve(getArg('root', process.cwd()))
const FLAG_QUIET = args.includes('--quiet')
const FLAG_JSON = args.includes('--json')
const FLAG_WARN_AS_ERROR = args.includes('--warn-as-error')

let cfg = {}
const cfgPath = join(ROOT, '.design-rules.json')
if (existsSync(cfgPath)) {
  try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { /* malformed → ignore */ }
}

const SCAN_DIRS = cfg.scanDirs ?? ['components', 'app', 'src']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', 'test-results', 'playwright-report', '.turbo', '.git'])
const SKIP_FILES = new Set(cfg.skipFiles ?? [])
const ALLOWED_EXTS = new Set(['.tsx', '.ts', '.jsx', '.js'])
const BRAND_HEXES = (cfg.brandHexes ?? []).map((h) => h.replace(/^#/, '').toLowerCase())

const BRAND_HEX_RE = BRAND_HEXES.length
  ? new RegExp(`\\b(bg|text|border|ring|fill|stroke|shadow|from|to|via|outline|decoration|placeholder|caret|accent|divide)-\\[#(${BRAND_HEXES.join('|')})(\\/\\d+)?\\]`, 'gi')
  : null

function* walkFiles(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (entry.name === 'dev' && dir.replace(/\\/g, '/').endsWith('/app')) continue
      yield* walkFiles(path)
      continue
    }
    if (!entry.isFile()) continue
    const idx = entry.name.lastIndexOf('.')
    const ext = idx === -1 ? '' : entry.name.slice(idx)
    if (!ALLOWED_EXTS.has(ext)) continue
    if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue
    if (path.includes(`__tests__${sep}`)) continue
    const rel = path.replace(ROOT + sep, '').split(sep).join('/')
    if (SKIP_FILES.has(rel)) continue
    yield path
  }
}

export function checkBrandHex(line, re = BRAND_HEX_RE) {
  if (!re) return []
  const v = []
  for (const m of line.matchAll(re)) v.push({ rule: 'R1', level: 'error', match: m[0] })
  return v
}
export function checkResponsiveGrid(line) {
  const stripped = line.replace(/\b(sm|md|lg|xl|2xl):grid-cols-\d+\b/g, '')
  const v = []
  for (const m of stripped.matchAll(/\bgrid-cols-([3-9]|1[0-9])\b/g)) v.push({ rule: 'R2', level: 'error', match: m[0] })
  return v
}
export function checkBackLinkInline(line) {
  const v = []
  for (const m of line.matchAll(/<(?:a|Link)\b[^>]*>\s*(?:←|&larr;)\s*\S/g)) v.push({ rule: 'R3', level: 'error', match: m[0].slice(0, 50) })
  return v
}
export function checkTouchTarget(line) {
  const v = []
  if (!/<button\b|role="button"|onClick=/.test(line)) return v
  if (!/text-xs\b/.test(line)) return v
  if (!/\bpy-(0\.5|1|1\.5)\b/.test(line)) return v
  if (/\bmin-h-\d+/.test(line)) return v
  if (/\bButton\b.*\bsize=/.test(line)) return v
  v.push({ rule: 'W1', level: 'warn', match: 'chip < 44px' })
  return v
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false
if (isMain) {
  const findings = []
  let filesScanned = 0
  for (const dir of SCAN_DIRS) {
    for (const file of walkFiles(join(ROOT, dir))) {
      filesScanned++
      const rel = file.replace(ROOT + sep, '').split(sep).join('/')
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        for (const v of [...checkBrandHex(lines[i]), ...checkResponsiveGrid(lines[i]), ...checkBackLinkInline(lines[i]), ...checkTouchTarget(lines[i])]) {
          findings.push({ file: rel, line: i + 1, ...v })
        }
      }
    }
  }
  const errors = findings.filter((f) => f.level === 'error')
  const warns = findings.filter((f) => f.level === 'warn')
  if (FLAG_JSON) {
    console.log(JSON.stringify({ filesScanned, errors, warns }, null, 2))
  } else {
    if (!FLAG_QUIET) {
      for (const f of findings) console.log(`${f.level === 'error' ? 'ERROR' : 'WARN '} ${f.rule} ${f.file}:${f.line}: ${f.match}`)
      if (findings.length > 0) console.log('')
    }
    console.log(`Design rules — ${filesScanned} archivos.`)
    console.log(`  R1 brand-token        ${errors.filter((e) => e.rule === 'R1').length} (error)${BRAND_HEX_RE ? '' : ' — sin brandHexes en .design-rules.json'}`)
    console.log(`  R2 responsive-grid    ${errors.filter((e) => e.rule === 'R2').length} (error)`)
    console.log(`  R3 backlink-inline    ${errors.filter((e) => e.rule === 'R3').length} (error)`)
    console.log(`  W1 touch-target       ${warns.length} (warn)`)
  }
  process.exit(errors.length > 0 || (FLAG_WARN_AS_ERROR && warns.length > 0) ? 1 : 0)
}
