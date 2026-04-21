import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const isDevMode = !supabaseUrl || supabaseUrl === "https://xxx.supabase.co";

/**
 * Supabase browser client. En dev mode (sin credenciales) devuelve un stub
 * mínimo para que @supabase/ssr no tire en SSR.
 */
export function createClient() {
  if (isDevMode) {
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        signOut: async () => ({ error: null }),
      },
    } as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
}
