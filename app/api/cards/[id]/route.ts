import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

// Change quantity, or move copies to another box
export async function PATCH(request: Request, { params }: Params) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const { data: card, error: findError } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  // --- Moving copies to another box ---
  if (body.move) {
    const toBox = String(body.move.toBox ?? "").trim() || "Unsorted";
    const count = Math.min(card.quantity, Math.max(1, Math.floor(Number(body.move.count) || 1)));

    if (toBox === card.box) {
      return NextResponse.json({ error: "That card is already in this box" }, { status: 400 });
    }

    // Does the other box already have this exact card?
    const { data: target, error: targetError } = await supabase
      .from("cards")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("scryfall_id", card.scryfall_id)
      .eq("foil", card.foil)
      .eq("box", toBox)
      .maybeSingle();

    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });

    if (target) {
      const { error } = await supabase
        .from("cards")
        .update({ quantity: target.quantity + count })
        .eq("id", target.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const copy = { ...card, box: toBox, quantity: count };
      delete copy.id;
      delete copy.added_at;
      const { error } = await supabase.from("cards").insert(copy);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Take the copies out of the original box
    if (count >= card.quantity) {
      const { error } = await supabase.from("cards").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from("cards")
        .update({ quantity: card.quantity - count })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ moved: count, toBox });
  }

  // --- Changing the quantity ---
  if (body.quantity !== undefined) {
    const quantity = Math.floor(Number(body.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) {
      return NextResponse.json({ error: "Quantity must be at least 1" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("cards")
      .update({ quantity })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ card: updated });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

// Remove the card from your collection entirely
export async function DELETE(_request: Request, { params }: Params) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from("cards").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}