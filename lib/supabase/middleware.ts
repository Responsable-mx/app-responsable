import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CRON_BYPASS_PREFIXES = ["/api/cron/"];

function isCronBypassAllowed(pathname: string): boolean {
  return CRON_BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
  // DEV MODE: sin Supabase configurado, permitir todo
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "https://xxx.supabase.co") {
    return NextResponse.next({ request });
  }

  // Bypass de crons con CRON_SECRET — antes de cualquier round-trip Supabase
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const cronSecret = process.env.CRON_SECRET;
    if (
      cronSecret &&
      token === cronSecret &&
      isCronBypassAllowed(request.nextUrl.pathname)
    ) {
      return NextResponse.next({ request });
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // /dev/* solo en non-prod — nunca en producción.
  if (pathname.startsWith("/dev/") && process.env.NODE_ENV !== "production") {
    return supabaseResponse;
  }

  // Sin sesión → /login
  if (
    !user &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/api/auth/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Con sesión en /login → dashboard
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/clientes";
    return NextResponse.redirect(url);
  }

  // Role leído del JWT (escrito en login-code). Sin DB call adicional por request.
  // Si el role cambia en DB, aplica al próximo login del usuario.
  // Los route handlers siempre re-validan con requireAdmin()/requireConsultorOrAdmin().
  const role = (user?.user_metadata?.role as string | undefined) ?? "consultor";

  // ── Gate rol cliente ─────────────────────────────────────────
  // Rutas internas bloqueadas para role='cliente'.
  if (user && role === "cliente") {
    const CLIENT_BLOCKED = [
      "/chat",
      "/equipo",
      "/clientes/nuevo",
      "/api/chat",
      "/api/chat-sessions",
      "/api/stage-templates",
      "/api/consultors",
      "/api/extract-test",
    ];
    if (CLIENT_BLOCKED.some((p) => pathname.startsWith(p))) {
      if (pathname.startsWith("/api/")) {
        return new NextResponse(
          JSON.stringify({ error: "No autorizado." }),
          { status: 403, headers: { "content-type": "application/json" } }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/clientes";
      return NextResponse.redirect(url);
    }
  }

  // ── Gate admin ───────────────────────────────────────────────
  const isAdminRoute =
    pathname.startsWith("/configuracion") ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/prompts");
  if (user && isAdminRoute && role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({ error: "Requiere permisos de administrador." }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = role === "cliente" ? "/clientes" : "/chat";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
