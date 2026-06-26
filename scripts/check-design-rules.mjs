// Gate GLOBAL de reglas de diseño — portable a cualquier proyecto (leads,
// s-peak-dashboard, app-responsable, futuros). Vive en ~/.claude/scripts/ para
// no duplicar la lógica; cada proyecto lo corre apuntando a su raíz.
// (sin shebang: se invoca vía `node`/`npm run`; quitarlo deja que vitest IMPORTE las funciones puras
//  para testearlas en cada app — el shebang rompe el import de vitest, lección leads 25-jun.)
//
// Origen: portado de s-peak-dashboard/scripts/check-design-rules.mjs (jun-2026),
// parametrizado por proyecto. Da garantía [1] (mecánica) a las reglas objetivas
// de diseño — lo que un script caza NO debe depender de que la IA lo note en cada
// audit (best practice 1 de design-audit-best-practices).
//
// Reglas (ERROR — bloquean):
//   R1. brand-token       hex de marca inline (bg-[#xxxxxx]) en vez de token.
//                         Los hexes de marca se leen de <root>/.design-rules.json
//                         (key "brandHexes": ["1a3c4d", ...]). Sin ese archivo, R1
//                         se SALTA (no toda app tiene tokens definidos aún).
//   R2. responsive-grid   grid-cols-N (N>=3) sin breakpoint → ilegible en móvil.
//   R3. backlink-inline   <a>/<Link> inline cuyo texto arranca con "← ".
//   R4. img-alt           <img>/<Image> sin alt (WCAG 1.1.1).
//   R5. positive-tabindex tabindex positivo (WCAG 2.4.3 — rompe el foco natural).
//   R6. bar-track-collapse `flex h-NN items-end` → barras hijas (flex-1) colapsan a
//                         0px (incidente leads 25-jun). Escape: `// layout-ok`.
//
// Reglas (WARN — no bloquean, para revisión):
//   W1. touch-target      botón interactivo text-xs + py-1/1.5 sin min-h a 44px.
//   W2. low-contrast-text text-gray-300/400/500 para CONTENIDO (body ≥700, helper ≥600).
//   W3. clickable-semantics <div>/<span> con onClick sin role (debería ser <button>).
//
// Uso:
//   node ~/.claude/scripts/check-design-rules.mjs --root="C:\...\leads"
//   node ~/.claude/scripts/check-design-rules.mjs --root=. --json
//   node ~/.claude/scripts/check-design-rules.mjs --root=. --quiet
//   node ~/.claude/scripts/check-design-rules.mjs --root=. --warn-as-error
//
// Config opcional por proyecto — <root>/.design-rules.json:
//   { "brandHexes": ["1a3c4d","ef7522"], "scanDirs": ["components","app"],
//     "skipFiles": ["components/ui/Button.tsx"] }
//
// Sale con código 1 si hay violaciones R1/R2/R3 (o W1 con --warn-as-error).

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

// Config por proyecto (opcional)
let cfg = {}
const cfgPath = join(ROOT, '.design-rules.json')
if (existsSync(cfgPath)) {
  try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { /* ignore malformed */ }
}

const SCAN_DIRS = cfg.scanDirs ?? ['components', 'app', 'src']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', 'test-results', 'playwright-report', '.turbo', '.git'])
const SKIP_FILES = new Set(cfg.skipFiles ?? [])
const ALLOWED_EXTS = new Set(['.tsx', '.ts', '.jsx', '.js'])
const BRAND_HEXES = (cfg.brandHexes ?? []).map((h) => h.replace(/^#/, '').toLowerCase())

const BRAND_HEX_RE = BRAND_HEXES.length
  ? new RegExp(
      `\\b(bg|text|border|ring|fill|stroke|shadow|from|to|via|outline|decoration|placeholder|caret|accent|divide)-\\[#(${BRAND_HEXES.join('|')})(\\/\\d+)?\\]`,
      'gi',
    )
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
  const violations = []
  for (const m of line.matchAll(re)) violations.push({ rule: 'R1', level: 'error', match: m[0] })
  return violations
}

export function checkResponsiveGrid(line) {
  const stripped = line.replace(/\b(sm|md|lg|xl|2xl):grid-cols-\d+\b/g, '')
  const violations = []
  for (const m of stripped.matchAll(/\bgrid-cols-([3-9]|1[0-9])\b/g)) {
    violations.push({ rule: 'R2', level: 'error', match: m[0] })
  }
  return violations
}

export function checkBackLinkInline(line) {
  const violations = []
  const RE = /<(?:a|Link)\b[^>]*>\s*(?:←|&larr;)\s*\S/g
  for (const m of line.matchAll(RE)) violations.push({ rule: 'R3', level: 'error', match: m[0].slice(0, 50) })
  return violations
}

export function checkTouchTarget(line) {
  const violations = []
  if (!/<button\b|role="button"|onClick=/.test(line)) return violations
  if (!/text-xs\b/.test(line)) return violations
  if (!/\bpy-(0\.5|1|1\.5)\b/.test(line)) return violations
  if (/\bmin-h-\d+/.test(line)) return violations
  if (/\bButton\b.*\bsize=/.test(line)) return violations
  violations.push({ rule: 'W1', level: 'warn', match: 'chip < 44px' })
  return violations
}

// R4 (ERROR) — <img>/<Image> sin alt (WCAG 1.1.1). Solo etiquetas que abren+cierran en la misma línea.
export function checkImgAlt(line) {
  const violations = []
  for (const m of line.matchAll(/<(?:img|Image)\s[^>]*>/g)) {
    if (!/\balt\s*=/.test(m[0])) violations.push({ rule: 'R4', level: 'error', match: m[0].slice(0, 40) })
  }
  return violations
}
// R5 (ERROR) — tabindex positivo (WCAG 2.4.3: rompe el orden de foco natural).
export function checkPositiveTabIndex(line) {
  const violations = []
  for (const m of line.matchAll(/tab[Ii]ndex=\{?\s*["']?([1-9]\d*)/g)) {
    violations.push({ rule: 'R5', level: 'error', match: m[0].slice(0, 30) })
  }
  return violations
}
// R6 (ERROR) — colapso de barra: `flex` de ALTURA FIJA (h-NN) con `items-end` → las columnas hijas
// (flex-1) colapsan a 0px y las barras desaparecen (incidente leads 25-jun-2026; pasó TODAS las
// auditorías porque el dato cuadraba). Lo correcto para un riel de barras es `items-stretch` (default).
// Escape para usos legítimos (toolbar al fondo, barras en px): comentar `layout-ok` en la misma línea.
export function checkBarTrackCollapse(line) {
  const violations = []
  if (/layout-ok/.test(line)) return violations
  const hasDisplayFlex = /["'`\s]flex["'`\s]/.test(line)
  const hasFixedHeight = /["'`\s]h-(?:\d|\[)/.test(line)
  const hasItemsEnd = /["'`\s]items-end["'`\s]/.test(line)
  if (hasDisplayFlex && hasFixedHeight && hasItemsEnd && !/items-stretch/.test(line)) {
    violations.push({ rule: 'R6', level: 'error', match: 'flex h-NN items-end → barras hijas colapsan a 0px (usa items-stretch, o // layout-ok)' })
  }
  return violations
}
// W2 (WARN) — texto gris bajo-contraste para CONTENIDO (body ≥gray-700, helper ≥gray-600).
export function checkLowContrastText(line) {
  const violations = []
  for (const m of line.matchAll(/\btext-gray-(?:300|400|500)\b/g)) {
    violations.push({ rule: 'W2', level: 'warn', match: m[0] })
  }
  return violations
}
// W3 (WARN) — <div>/<span> con onClick sin role (WCAG 4.1.2: debería ser <button>).
export function checkClickableSemantics(line) {
  const violations = []
  for (const m of line.matchAll(/<(?:div|span)\s[^>]*\bonClick=[^>]*>/g)) {
    if (!/\brole\s*=/.test(m[0])) violations.push({ rule: 'W3', level: 'warn', match: m[0].slice(0, 50) })
  }
  return violations
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
        for (const v of [
          ...checkBrandHex(lines[i]),
          ...checkResponsiveGrid(lines[i]),
          ...checkBackLinkInline(lines[i]),
          ...checkTouchTarget(lines[i]),
          ...checkImgAlt(lines[i]),
          ...checkPositiveTabIndex(lines[i]),
          ...checkBarTrackCollapse(lines[i]),
          ...checkLowContrastText(lines[i]),
          ...checkClickableSemantics(lines[i]),
        ]) {
          findings.push({ file: rel, line: i + 1, ...v })
        }
      }
    }
  }
  const errors = findings.filter((f) => f.level === 'error')
  const warns = findings.filter((f) => f.level === 'warn')

  if (FLAG_JSON) {
    console.log(JSON.stringify({ root: ROOT, filesScanned, errors, warns }, null, 2))
  } else {
    if (!FLAG_QUIET) {
      for (const f of findings) console.log(`${f.level === 'error' ? 'ERROR' : 'WARN '} ${f.rule} ${f.file}:${f.line}: ${f.match}`)
      if (findings.length > 0) console.log('')
    }
    const errCount = (r) => errors.filter((e) => e.rule === r).length
    const warnCount = (r) => warns.filter((w) => w.rule === r).length
    console.log(`Design rules — ${filesScanned} archivos en ${ROOT}`)
    console.log(`  R1 brand-token         ${errCount('R1')} (error)${BRAND_HEX_RE ? '' : ' — sin .design-rules.json brandHexes, R1 saltada'}`)
    console.log(`  R2 responsive-grid     ${errCount('R2')} (error)`)
    console.log(`  R3 backlink-inline     ${errCount('R3')} (error)`)
    console.log(`  R4 img-alt             ${errCount('R4')} (error)`)
    console.log(`  R5 positive-tabindex   ${errCount('R5')} (error)`)
    console.log(`  R6 bar-track-collapse  ${errCount('R6')} (error)`)
    console.log(`  W1 touch-target        ${warnCount('W1')} (warn)`)
    console.log(`  W2 low-contrast-text   ${warnCount('W2')} (warn)`)
    console.log(`  W3 clickable-semantics ${warnCount('W3')} (warn)`)
  }
  process.exit(errors.length > 0 || (FLAG_WARN_AS_ERROR && warns.length > 0) ? 1 : 0)
}
