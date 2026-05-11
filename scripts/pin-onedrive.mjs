#!/usr/bin/env node
/**
 * Pin del proyecto contra OneDrive Files-On-Demand.
 *
 * Por qué existe: este repo vive bajo `C:\Users\…\OneDrive\…\app-responsable`.
 * OneDrive con Files-On-Demand puede marcar archivos como "online-only"
 * (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS) cuando no se usan en un rato. Cuando
 * eso pasa, herramientas que leen via stdlib (`ls`, `find`, `stat`, `readFileSync`
 * en algunos modos) los ven como ausentes — el archivo está, pero su contenido
 * vive en la nube y no se baja hasta que alguien lo abre con Win32 API.
 *
 * Síntoma típico: `git status` no muestra el archivo, `ls` no lo encuentra,
 * pero el `Read` tool sí lo lee. Si en ese estado se commitea el resto, el
 * archivo se "pierde" del repo aunque siga en disco. Caso real: may-2026,
 * 5 archivos del feature questionnaire-snapshots quedaron invisibles a git
 * después de editarse; se fixeó manualmente con ReadAllBytes+WriteAllBytes.
 *
 * Este script ejecuta `attrib +P /S /D` recursivo sobre el repo, que pinea
 * todo a "always keep on this device". Es seguro (idempotente, no modifica
 * contenido), rápido (~5s para 40k archivos) y solo aplica al árbol del repo.
 *
 * Uso:
 *   node scripts/pin-onedrive.mjs            # pinea el proyecto
 *   node scripts/pin-onedrive.mjs --check    # solo reporta cuántos están online-only
 *
 * Recomendado: correr antes de cualquier `git commit` o `npm run build` que
 * dependa de archivos creados en sesiones recientes.
 */

import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = process.cwd()
const FLAG_CHECK = process.argv.includes('--check')

// Solo aplica en Windows. En Linux/Mac no hay OneDrive Files-On-Demand.
if (process.platform !== 'win32') {
  console.log('pin-onedrive: skip (no Windows, no aplica).')
  process.exit(0)
}

if (FLAG_CHECK) {
  // Reporta cuántos archivos del proyecto están online-only.
  // RECALL_ON_DATA_ACCESS = 0x400000. PowerShell devuelve attr como int.
  const ps = `Get-ChildItem -Path '${ROOT}' -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { ([int]$_.Attributes -band 0x400000) -ne 0 } | Measure-Object | Select-Object -ExpandProperty Count`
  const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8' }).trim()
  const n = parseInt(out, 10) || 0
  console.log(`pin-onedrive --check: ${n} archivos en estado online-only.`)
  process.exit(n > 0 ? 1 : 0)
}

console.log(`pin-onedrive: pineando todo el árbol de ${ROOT}…`)
try {
  // /S = recursivo, /D = aplica a directorios también, +P = pin local
  execSync(`attrib +P /S /D "${join(ROOT, '*')}"`, { stdio: 'inherit' })
  console.log('pin-onedrive: OK.')
} catch (err) {
  console.error('pin-onedrive: error:', err.message)
  process.exit(1)
}
