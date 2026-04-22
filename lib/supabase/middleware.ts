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

  // Bypass de crons con CRON_SECRET
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const cronSecret = process.env.CRON_SECRET;
    if (
      cronSecret &&
      token === cronSecret &&
      isCronBypassAllowed(request.nextUrl.pathname)
    ) {
      return supabaseResponse;
    }
  }

  const { pathname } = request.nextUrl;

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
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  // Gate /configuracion y /api/catalogs|users mutaciones → solo admin.
  // Lectura a /api/catalogs sigue abierta a todo consultor autenticado.
  const role = (user?.user_metadata?.role as string | undefined) ?? "consultor";
  const isAdminRoute =
    pathname.startsWith("/configuracion") ||
    pathname.startsWith("/api/users");
  if (user && isAdminRoute && role !== "admin") {
    // API → JSON 403; UI → redirect /chat
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({ error: "Requiere permisos de administrador." }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
