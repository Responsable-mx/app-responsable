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
  // IPv4-mapped IPv6 (::ffff:192.168.x.x o ::ffff:c0a8:101 normalizado por Node.js WHATWG)
  // Node.js URL parser convierte la notación mixta a grupos hex: ::ffff:192.168.1.1 → ::ffff:c0a8:101
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice(7);
    let ipv4: string;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(mapped)) {
      ipv4 = mapped; // ya en notación dotted decimal (entorno no-Node o versión futura)
    } else {
      const [p0, p1, ...rest] = mapped.split(":");
      if (!p0 || !p1 || rest.length > 0) return { ok: true };
      const hi = parseInt(p0, 16);
      const lo = parseInt(p1, 16);
      if (isNaN(hi) || isNaN(lo)) return { ok: true };
      ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
    if (/^127\./.test(ipv4) || /^10\./.test(ipv4) || /^192\.168\./.test(ipv4) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ipv4) || /^169\.254\./.test(ipv4)) {
      return { ok: false, reason: "IP privada (IPv4-mapped IPv6)" };
    }
  }
  return { ok: true };
}

/**
 * fetch anti-SSRF: sigue redirects MANUALMENTE y revalida cada `Location` con
 * isPublicHttpUrl. Sin esto, `redirect: "follow"` puede saltar de una URL pública
 * a una IP interna / metadata cloud (169.254.169.254) tras un 302.
 * Lanza si la URL inicial o cualquier salto es privado, o si hay demasiados saltos.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const guard = isPublicHttpUrl(current);
    if (!guard.ok) throw new Error(`URL bloqueada (SSRF): ${guard.reason}`);
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString(); // resuelve redirects relativos
      continue;
    }
    return res;
  }
  throw new Error("Demasiados redirects (posible SSRF)");
}
