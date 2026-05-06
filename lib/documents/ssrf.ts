import "server-only";

// Bloquea localhost, IPs privadas RFC1918, link-local, IPv6 ULA.
// Aplica antes de fetch a URLs externas (ingestion de informes).
export function isPublicHttpUrl(u: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "Protocolo no permitido" };
  }
  const rawHost = parsed.hostname.toLowerCase();
  // URL.hostname para IPv6 retorna con corchetes (ej. "[::1]") — quítalos para checks
  const host = rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;
  if (host === "localhost" || host === "0.0.0.0") return { ok: false, reason: "Host privado" };
  if (/^127\./.test(host)) return { ok: false, reason: "IP privada (loopback)" };
  if (/^10\./.test(host)) return { ok: false, reason: "IP privada (RFC1918 10.0.0.0/8)" };
  if (/^192\.168\./.test(host)) return { ok: false, reason: "IP privada (RFC1918 192.168.0.0/16)" };
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return { ok: false, reason: "IP privada (RFC1918 172.16.0.0/12)" };
  if (/^169\.254\./.test(host)) return { ok: false, reason: "Link-local (169.254.0.0/16)" };
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return { ok: false, reason: "IP privada IPv6" };
  return { ok: true };
}
