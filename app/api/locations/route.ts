import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";

// List your boxes and other storage spots
export async function GET() {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { data, error } = await supabase
    .from("locations")
    .select("id, name, kind, rows")
    .eq("user_id", user.id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: data });
}