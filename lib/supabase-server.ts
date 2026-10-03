import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase connection for back-end routes, acting as the signed-in person.
// Your database privacy rules apply, so it can only reach that person's cards.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Some places can't set cookies; proxy.ts keeps logins fresh instead
          }
        },
      },
    }
  );
}

// Returns the connection plus whoever is signed in (or null if nobody is)
export async function getUserAndClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}