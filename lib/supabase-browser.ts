import { createBrowserClient } from "@supabase/ssr";

// Supabase connection for pages running in the browser (login, log out)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}