import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";

const SCRYFALL_HEADERS = {
  "User-Agent": "MTGCollection/1.0",
  Accept: "application/json",
};

type ScryfallFace = {
  oracle_text?: string;
  colors?: string[];
  image_uris?: { normal?: string };
};

// Add one card
export async function POST(request: Request) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { name, box, quantity, foil } = await request.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Card name is required" }, { status: 400 });
  }

  // 1. Look the card up on Scryfall
  const res = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
    { headers: SCRYFALL_HEADERS }
  );
  if (!res.ok) {
    return NextResponse.json({ error: `Couldn't find "${name}" on Scryfall` }, { status: 404 });
  }
  const card = await res.json();
  const faces: ScryfallFace[] = card.card_faces ?? [];
  const firstFace = faces[0];

  const boxName = String(box || "").trim() || "Unsorted";
  const qty = Math.max(1, Number(quantity) || 1);
  const isFoil = Boolean(foil);
  const colors = card.colors ?? firstFace?.colors ?? [];

  // What the page needs to work out where the card goes
  const placeable = {
    name: card.name,
    colors,
    type_line: card.type_line ?? null,
    mana_value: card.cmc ?? null,
  };

  // 2. Check if you already have this card in this box
  const { data: existing, error: findError } = await supabase
    .from("cards")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("scryfall_id", card.id)
    .eq("foil", isFoil)
    .eq("box", boxName)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });

  // 3a. Already have it: just bump the quantity
  if (existing) {
    const newQty = existing.quantity + qty;
    const { error } = await supabase.from("cards").update({ quantity: newQty }).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      message: `Added ${qty} more ${card.name} (you now have ${newQty} in ${boxName})`,
      card: placeable,
    });
  }

  // 3b. New card: save it with its info from Scryfall
  const { error } = await supabase.from("cards").insert({
    user_id: user.id,
    scryfall_id: card.id,
    name: card.name,
    set_code: card.set,
    collector_number: card.collector_number,
    quantity: qty,
    foil: isFoil,
    box: boxName,
    colors,
    color_identity: card.color_identity ?? [],
    type_line: card.type_line,
    mana_value: card.cmc,
    oracle_text: card.oracle_text ?? faces.map((f) => f.oracle_text ?? "").join("\n//\n"),
    rarity: card.rarity,
    image_url: card.image_uris?.normal ?? firstFace?.image_uris?.normal ?? null,
    price_usd: isFoil ? card.prices?.usd_foil : card.prices?.usd,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: `Added ${qty} ${card.name} to ${boxName}`, card: placeable });
}

// List all of your cards
export async function GET() {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const pageSize = 1000;
  const allCards: Record<string, unknown>[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("user_id", user.id)
      .order("name")
      .range(from, from + pageSize - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    allCards.push(...data);
    if (data.length < pageSize) break;
  }

  return NextResponse.json({ cards: allCards });
}