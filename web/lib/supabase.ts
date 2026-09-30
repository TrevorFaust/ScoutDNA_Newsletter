import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/** Browser — session cookies via @supabase/ssr. */
export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Service-role server client. Bypasses RLS.
 * Use for published reads and for writer mutations after requireAdmin().
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}
