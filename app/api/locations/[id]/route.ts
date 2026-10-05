import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";
import { cleanName, cleanRows } from "@/lib/location-rules";

type Params = { params: Promise<{ id: string }> };

// Rename a box or spot, or change its rows
export async function PATCH(request: Request, { params }: Params) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const { data: location, error: findError } = await supabase
    .from("locations")
    .select("id, name, kind, rows")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};

  // New name?
  let renaming = false;
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) {
      return NextResponse.json({ error: "Give it a name (up to 60 characters)" }, { status: 400 });
    }
    if (name !== location.name) {
      // Make sure nothing else already uses that name
      const { data: clash } = await supabase
        .from("locations")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();
      if (clash) {
        return NextResponse.json({ error: `You already have a spot called "${name}"` }, { status: 400 });
      }

      const { count } = await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("box", name);
      if (count && count > 0) {
        return NextResponse.json(
          { error: `Some cards are already listed under "${name}". Pick a different name.` },
          { status: 400 }
        );
      }

      updates.name = name;
      renaming = true;
    }
  }

  // Box or simple spot? And its rows
  const kind = body.kind === undefined ? location.kind : body.kind === "other" ? "other" : "box";
  updates.kind = kind;
  if (kind === "box") {
    const rows = cleanRows(body.rows ?? location.rows);
    if (!rows) {
      return NextResponse.json(
        { error: "Those rows don't look right. Each group can only be in one row." },
        { status: 400 }
      );
    }
    updates.rows = rows;
  } else {
    updates.rows = [];
  }

  const { data: updated, error } = await supabase
    .from("locations")
    .update(updates)
    .eq("id", id)
    .select("id, name, kind, rows")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Renamed? Move every card in it to the new name
  if (renaming) {
    const { error: moveError } = await supabase
      .from("cards")
      .update({ box: updates.name })
      .eq("user_id", user.id)
      .eq("box", location.name);
    if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 });
  }

  return NextResponse.json({ location: updated });
}

// Delete a box or spot, but only once it's empty
export async function DELETE(_request: Request, { params }: Params) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { id } = await params;

  const { data: location } = await supabase
    .from("locations")
    .select("id, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const { count, error: countError } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("box", location.name);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if (count && count > 0) {
    return NextResponse.json(
      { error: `${location.name} still has cards in it. Move or delete them first.` },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}