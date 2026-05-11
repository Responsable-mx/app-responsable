// Defense-in-depth: garantiza que el helper apply-sql.mjs NO ejecute SQL
// destructiva sin la flag --confirm-destructive. Si alguien rompe el patrón
// de detección, este test falla y bloquea el daily-code-review.

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const HELPER = path.resolve("scripts/apply-sql.mjs")

function runHelper(sql: string): { code: number; stderr: string; stdout: string } {
  const tmp = path.join(os.tmpdir(), `apply-sql-test-${Date.now()}-${Math.random()}.sql`)
  fs.writeFileSync(tmp, sql)
  try {
    const stdout = execFileSync("node", [HELPER, tmp], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, stdout, stderr: "" }
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer }
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    }
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }
}

describe("scripts/apply-sql.mjs — modo paranoico (máxima protección)", () => {
  // ============================================================
  // Bloqueo de borrado de datos
  // ============================================================
  it("bloquea DELETE sin WHERE", () => {
    const r = runHelper("DELETE FROM foo;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("DELETE")
  })

  it("bloquea DELETE con WHERE (también, no nos fiamos del WHERE)", () => {
    const r = runHelper("DELETE FROM foo WHERE id = 5;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("DELETE")
  })

  it("bloquea DELETE con WHERE 1=1 (truco común)", () => {
    const r = runHelper("DELETE FROM foo WHERE 1=1;")
    expect(r.code).toBe(2)
  })

  it("bloquea TRUNCATE", () => {
    const r = runHelper("TRUNCATE foo;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("TRUNCATE")
  })

  // ============================================================
  // Bloqueo de modificación de datos
  // ============================================================
  it("bloquea UPDATE sin WHERE", () => {
    const r = runHelper("UPDATE foo SET x = 1;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("UPDATE")
  })

  it("bloquea UPDATE con WHERE (cualquier UPDATE)", () => {
    const r = runHelper("UPDATE foo SET x = 1 WHERE id = 5;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("UPDATE")
  })

  // ============================================================
  // Bloqueo de DROP
  // ============================================================
  it("bloquea DROP TABLE", () => {
    const r = runHelper("DROP TABLE foo;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("DROP")
  })

  it("bloquea DROP VIEW", () => {
    const r = runHelper("DROP VIEW foo;")
    expect(r.code).toBe(2)
  })

  it("bloquea DROP INDEX", () => {
    const r = runHelper("DROP INDEX foo;")
    expect(r.code).toBe(2)
  })

  it("bloquea DROP FUNCTION", () => {
    const r = runHelper("DROP FUNCTION foo();")
    expect(r.code).toBe(2)
  })

  it("bloquea DROP TRIGGER", () => {
    const r = runHelper("DROP TRIGGER foo ON bar;")
    expect(r.code).toBe(2)
  })

  it("bloquea DROP MATERIALIZED VIEW", () => {
    const r = runHelper("DROP MATERIALIZED VIEW foo;")
    expect(r.code).toBe(2)
  })

  it("bloquea DROP SEQUENCE", () => {
    const r = runHelper("DROP SEQUENCE foo_id_seq;")
    expect(r.code).toBe(2)
  })

  it("bloquea ALTER TABLE ... DROP COLUMN", () => {
    const r = runHelper("ALTER TABLE foo DROP COLUMN bar;")
    expect(r.code).toBe(2)
  })

  it("bloquea DROP POLICY (RLS)", () => {
    const r = runHelper('DROP POLICY "foo_select" ON foo;')
    expect(r.code).toBe(2)
  })

  // ============================================================
  // Bloqueo de cambios estructurales en columnas existentes
  // ============================================================
  it("bloquea ALTER COLUMN TYPE", () => {
    const r = runHelper("ALTER TABLE foo ALTER COLUMN bar TYPE text;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("ALTER COLUMN")
  })

  it("bloquea ALTER COLUMN DROP NOT NULL", () => {
    const r = runHelper("ALTER TABLE foo ALTER COLUMN bar DROP NOT NULL;")
    expect(r.code).toBe(2)
  })

  it("bloquea ALTER COLUMN SET DEFAULT", () => {
    const r = runHelper("ALTER TABLE foo ALTER COLUMN bar SET DEFAULT 0;")
    expect(r.code).toBe(2)
  })

  it("bloquea ALTER TABLE ... RENAME COLUMN (rompe código)", () => {
    const r = runHelper("ALTER TABLE foo RENAME COLUMN bar TO baz;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("RENAME")
  })

  it("bloquea ALTER TABLE ... RENAME TO (renombra tabla)", () => {
    const r = runHelper("ALTER TABLE foo RENAME TO baz;")
    expect(r.code).toBe(2)
  })

  // ============================================================
  // Bloqueo de cambios de permisos / RLS
  // ============================================================
  it("bloquea REVOKE", () => {
    const r = runHelper("REVOKE SELECT ON foo FROM service_role;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("REVOKE")
  })

  it("bloquea DISABLE ROW LEVEL SECURITY", () => {
    const r = runHelper("ALTER TABLE foo DISABLE ROW LEVEL SECURITY;")
    expect(r.code).toBe(2)
  })

  // ============================================================
  // Bloqueo de blast radius amplificadores
  // ============================================================
  it("bloquea CASCADE", () => {
    const r = runHelper("ALTER TABLE foo DROP CONSTRAINT bar CASCADE;")
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("CASCADE")
  })

  // ============================================================
  // Bloqueo de operaciones masivas / lock prolongado
  // ============================================================
  it("bloquea INSERT ... SELECT (carga masiva)", () => {
    const r = runHelper("INSERT INTO foo (x) SELECT y FROM bar;")
    expect(r.code).toBe(2)
  })

  it("bloquea VACUUM FULL", () => {
    const r = runHelper("VACUUM FULL foo;")
    expect(r.code).toBe(2)
  })

  it("bloquea REINDEX", () => {
    const r = runHelper("REINDEX TABLE foo;")
    expect(r.code).toBe(2)
  })

  // ============================================================
  // Permite operaciones puramente aditivas
  // ============================================================
  // Tests con timeout extendido por OneDrive Files-On-Demand: spawn de helper Node.js
  // que abre archivos en path con espacios puede tardar 5-15s la primera vez.
  it("permite ALTER TABLE ADD COLUMN IF NOT EXISTS", { timeout: 30000 }, () => {
    const r = runHelper("ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar int DEFAULT 0;")
    // No es destructivo → no debe bloquearse en pre-check.
    // Falla luego por PAT/red (los tests no tienen credenciales reales contra Supabase),
    // pero el exit no debe ser 2 (que es el bloqueo destructivo).
    expect(r.code).not.toBe(2)
  })

  it("permite CREATE TABLE IF NOT EXISTS", { timeout: 30000 }, () => {
    const r = runHelper("CREATE TABLE IF NOT EXISTS foo (id int PRIMARY KEY);")
    expect(r.code).not.toBe(2)
  })

  it("permite CREATE OR REPLACE VIEW", () => {
    const r = runHelper("CREATE OR REPLACE VIEW v AS SELECT 1;")
    expect(r.code).not.toBe(2)
  })

  it("permite CREATE INDEX IF NOT EXISTS", () => {
    const r = runHelper("CREATE INDEX IF NOT EXISTS idx_foo ON foo (id);")
    expect(r.code).not.toBe(2)
  })

  it("permite COMMENT ON COLUMN", { timeout: 30000 }, () => {
    const r = runHelper("COMMENT ON COLUMN foo.bar IS 'descripción';")
    expect(r.code).not.toBe(2)
  })

  it("permite GRANT SELECT (otorgar permisos)", () => {
    const r = runHelper("GRANT SELECT ON foo TO service_role;")
    expect(r.code).not.toBe(2)
  })

  it("permite INSERT simple (seed individual)", () => {
    const r = runHelper("INSERT INTO foo (id, name) VALUES (1, 'seed');")
    expect(r.code).not.toBe(2)
  })

  // ============================================================
  // Comentarios no causan falsos positivos
  // ============================================================
  it("ignora keywords destructivas dentro de comentarios -- de línea", () => {
    const r = runHelper(
      "-- DROP TABLE foo será reemplazado\nALTER TABLE bar ADD COLUMN IF NOT EXISTS baz int;",
    )
    expect(r.code).not.toBe(2)
  })

  it("ignora keywords destructivas dentro de comentarios /* */ de bloque", () => {
    const r = runHelper(
      "/* DROP TABLE foo es histórico */\nCREATE INDEX IF NOT EXISTS idx_bar ON foo (x);",
    )
    expect(r.code).not.toBe(2)
  })
})
