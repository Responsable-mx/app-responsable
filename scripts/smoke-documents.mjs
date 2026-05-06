#!/usr/bin/env node
/**
 * Smoke test del subsistema de documentos.
 * Uso:
 *   node scripts/smoke-documents.mjs <CLIENT_ID> [BASE_URL]
 *
 * Pre-requisito: estar logueado en el navegador y copiar la cookie:
 *   - DevTools > Application > Cookies > sb-*-auth-token (valor completo)
 *   - export SB_COOKIE='sb-xxx-auth-token=...; ...'
 *
 * Tests ejecutados:
 *   1. GET /api/clients/:id/documents (auth válida)
 *   2. POST /api/clients/:id/documents con TXT pequeño
 *   3. GET /api/clients/:id/documents/:docId?mode=content (verifica parse)
 *   4. POST /api/clients/:id/research-reports {kind: financial_report}
 *   5. DELETE /api/clients/:id/documents/:docId (admin)
 */

const CLIENT_ID = process.argv[2];
const BASE = process.argv[3] ?? "https://app.responsable.net";
const COOKIE = process.env.SB_COOKIE ?? "";

if (!CLIENT_ID) {
  console.error("Uso: node scripts/smoke-documents.mjs <CLIENT_ID> [BASE_URL]");
  console.error("También: export SB_COOKIE='sb-xxx-auth-token=...'");
  process.exit(1);
}

if (!COOKIE) {
  console.error("⚠ SB_COOKIE no seteada. Tests retornarán 307→login.");
}

const headers = COOKIE ? { Cookie: COOKIE } : {};

let docId = null;

async function step(name, fn) {
  process.stdout.write(`→ ${name}... `);
  try {
    await fn();
    console.log("✓");
  } catch (e) {
    console.log(`✗ ${e.message}`);
    process.exit(1);
  }
}

await step("1. GET /documents (auth)", async () => {
  const res = await fetch(`${BASE}/api/clients/${CLIENT_ID}/documents`, { headers });
  if (res.status === 307) throw new Error("auth falló - revisa SB_COOKIE");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  console.log(`  (${j.data.length} docs existentes)`);
});

await step("2. POST /documents con TXT", async () => {
  const fd = new FormData();
  const txt = `# Smoke test ${new Date().toISOString()}\n\nContenido de prueba para verificar pipeline completo.\n\nEmpresa: ResponSable\nIndustria: Consultoría sostenibilidad`;
  fd.append("file", new Blob([txt], { type: "text/plain" }), "smoke-test.txt");
  fd.append("kind", "general");
  const res = await fetch(`${BASE}/api/clients/${CLIENT_ID}/documents`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  docId = j.data.id;
  if (j.data.parse_status !== "ok") throw new Error(`parse_status=${j.data.parse_status}`);
  console.log(`  (id=${docId.slice(0, 8)}…)`);
});

await step("3. GET /documents/:id?mode=content", async () => {
  const res = await fetch(`${BASE}/api/clients/${CLIENT_ID}/documents/${docId}?mode=content`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.data.markdown_content?.includes("Smoke test")) {
    throw new Error("markdown_content no contiene texto esperado");
  }
});

await step("4. POST /research-reports financial (90s timeout, IA real)", async () => {
  const res = await fetch(`${BASE}/api/clients/${CLIENT_ID}/research-reports`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "financial_report" }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  console.log(`  (${j.data.candidates.length} candidatos)`);
});

await step("5. DELETE /documents/:id (admin)", async () => {
  const res = await fetch(`${BASE}/api/clients/${CLIENT_ID}/documents/${docId}`, {
    method: "DELETE",
    headers,
  });
  if (res.status === 403) {
    console.log("  (403 esperado si no eres admin)");
    return;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

console.log("\n✓ Smoke test completo.");
