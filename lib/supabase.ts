import { createClient } from "@supabase/supabase-js";

// Server-side connection to your database using the secret key.
// Only import this in server code (API routes), never in a "use client" page.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
);