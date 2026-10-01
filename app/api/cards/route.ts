import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const SCRYFALL_HEADERS = {
  "User-Agent": "MTGCollection/1.0",
  Accept: "application/json",
};

type ScryfallFace = {
  oracle_text?: string;
  colors?: string[];
  image_uris?: { normal?: string };
};

export async function POST(request: Request) {
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
    return NextResponse.json(
      { error: `Couldn't find "${name}" on Scryfall` },
      { status: 404 }
    );
  }
  const card = await res.json();
  const faces: ScryfallFace[] = card.card_faces ?? [];
  const firstFace = faces[0];

  const boxName = String(box || "").trim() || "Unsorted";
  const qty = Math.max(1, Number(quantity) || 1);
  const isFoil = Boolean(foil);

  // 2. Check if you already have this card in this box
  const { data: existing, error: findError } = await supabase
    .from("cards")
    .select("id, quantity")
    .eq("scryfall_id", card.id)
    .eq("foil", isFoil)
    .eq("box", boxName)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  // 3a. Already have it: just bump the quantity
  if (existing) {
    const newQty = existing.quantity + qty;
    const { error } = await supabase
      .from("cards")
      .update({ quantity: newQty })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      message: `Added ${qty} more ${card.name} to ${boxName} (you now have ${newQty} there)`,
    });
  }

  // 3b. New card: save it with its info from Scryfall
  const { error } = await supabase.from("cards").insert({
    scryfall_id: card.id,
    name: card.name,
    set_code: card.set,
    collector_number: card.collector_number,
    quantity: qty,
    foil: isFoil,
    box: boxName,
    colors: card.colors ?? firstFace?.colors ?? [],
    color_identity: card.color_identity ?? [],
    type_line: card.type_line,
    mana_value: card.cmc,
    oracle_text:
      card.oracle_text ?? faces.map((f) => f.oracle_text ?? "").join("\n//\n"),
    rarity: card.rarity,
    image_url: card.image_uris?.normal ?? firstFace?.image_uris?.normal ?? null,
    price_usd: isFoil ? card.prices?.usd_foil : card.prices?.usd,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ message: `Added ${qty} ${card.name} to ${boxName}` });
}