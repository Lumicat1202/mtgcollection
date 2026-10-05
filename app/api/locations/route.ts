import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";
import { cleanName, cleanRows } from "@/lib/location-rules";

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

// Create a new box or spot
export async function POST(request: Request) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const body = await request.json();

  const name = cleanName(body.name);
  if (!name) {
    return NextResponse.json({ error: "Give it a name (up to 60 characters)" }, { status: 400 });
  }

  const kind = body.kind === "other" ? "other" : "box";
  const rows = kind === "box" ? cleanRows(body.rows) : [];
  if (!rows) {
    return NextResponse.json(
      { error: "Those rows don't look right. Each group can only be in one row." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("locations")
    .insert({ user_id: user.id, name, kind, rows })
    .select("id, name, kind, rows")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `You already have a spot called "${name}"` }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ location: data });
}