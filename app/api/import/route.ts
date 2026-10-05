import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";

// Cards worth this much or more get flagged after an import
const VALUABLE_PRICE = 5;

// What a valid Scryfall ID looks like
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SCRYFALL_HEADERS = {
  "User-Agent": "MTGCollection/1.0",
  Accept: "application/json",
  "Content-Type": "application/json",
};

type ImportRow = { scryfall_id: string; quantity: number; foil: boolean };

type ScryfallFace = {
  oracle_text?: string;
  colors?: string[];
  image_uris?: { normal?: string; small?: string };
};

type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  colors?: string[];
  color_identity?: string[];
  type_line?: string;
  cmc?: number;
  oracle_text?: string;
  rarity?: string;
  image_uris?: { normal?: string; small?: string };
  card_faces?: ScryfallFace[];
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
};

type ValuableCard = {
  name: string;
  price: number;
  foil: boolean;
  quantity: number;
  image: string | null;
};

// What the sorting guide needs to know about each imported card
type ImportedCard = {
  key: string;
  name: string;
  colors: string[];
  type_line: string | null;
  mana_value: number | null;
  quantity: number;
  foil: boolean;
  price: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Ask Scryfall for up to 75 cards, retrying if it says it's busy
async function fetchFromScryfall(ids: string[]): Promise<ScryfallCard[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: SCRYFALL_HEADERS,
      body: JSON.stringify({ identifiers: ids.map((id) => ({ id })) }),
    });

    if (res.status === 429) {
      await sleep(1000 * attempt);
      continue;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const details = data?.details ? `: ${data.details}` : "";
      throw new Error(`Scryfall request failed (${res.status})${details}`);
    }
    return (data?.data ?? []) as ScryfallCard[];
  }
  throw new Error("Scryfall is busy right now. Wait a minute and try again.");
}

export async function POST(request: Request) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { box, rows } = (await request.json()) as { box?: string; rows?: ImportRow[] };
  const boxName = String(box || "").trim() || "Unsorted";

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No cards to import" }, { status: 400 });
  }

  // 1. Clean up IDs, skip malformed ones, and combine duplicate rows
  const notFound: string[] = [];
  const combined = new Map<string, ImportRow>();
  for (const row of rows) {
    const id = String(row.scryfall_id ?? "").trim().toLowerCase();
    if (!SCRYFALL_ID.test(id)) {
      notFound.push(id || "(blank)");
      continue;
    }
    const key = `${id}|${Boolean(row.foil)}`;
    const qty = Math.max(1, Number(row.quantity) || 1);
    const existing = combined.get(key);
    if (existing) existing.quantity += qty;
    else combined.set(key, { scryfall_id: id, foil: Boolean(row.foil), quantity: qty });
  }
  const items = Array.from(combined.values());
  const uniqueIds = Array.from(new Set(items.map((i) => i.scryfall_id)));

  if (items.length === 0) {
    return NextResponse.json({ error: "None of the rows had a valid Scryfall ID" }, { status: 400 });
  }

  // 2. Get card details from Scryfall, 75 cards per request (their limit)
  const cardsById = new Map<string, ScryfallCard>();
  try {
    for (let i = 0; i < uniqueIds.length; i += 75) {
      const cards = await fetchFromScryfall(uniqueIds.slice(i, i + 75));
      for (const card of cards) cardsById.set(card.id, card);
      await sleep(100);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Scryfall request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 3. Find how many of each you already have in this box
  const existingQty = new Map<string, number>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const { data, error } = await supabase
      .from("cards")
      .select("scryfall_id, foil, quantity")
      .eq("user_id", user.id)
      .eq("box", boxName)
      .in("scryfall_id", uniqueIds.slice(i, i + 100));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data) existingQty.set(`${row.scryfall_id}|${row.foil}`, row.quantity);
  }

  // 4. Build the rows to save, plus the valuable list and the sorting guide list
  const valuable: ValuableCard[] = [];
  const imported: ImportedCard[] = [];
  const toSave = [];
  let importedCopies = 0;

  for (const item of items) {
    const card = cardsById.get(item.scryfall_id);
    if (!card) {
      notFound.push(item.scryfall_id);
      continue;
    }
    const faces = card.card_faces ?? [];
    const firstFace = faces[0];
    const key = `${item.scryfall_id}|${item.foil}`;
    importedCopies += item.quantity;

    const price = item.foil
      ? card.prices?.usd_foil ?? card.prices?.usd_etched ?? null
      : card.prices?.usd ?? null;
    const priceNumber = price === null ? 0 : Number(price);
    const colors = card.colors ?? firstFace?.colors ?? [];

    if (priceNumber >= VALUABLE_PRICE) {
      valuable.push({
        name: card.name,
        price: priceNumber,
        foil: item.foil,
        quantity: item.quantity,
        image: card.image_uris?.small ?? firstFace?.image_uris?.small ?? null,
      });
    }

    imported.push({
      key,
      name: card.name,
      colors,
      type_line: card.type_line ?? null,
      mana_value: card.cmc ?? null,
      quantity: item.quantity,
      foil: item.foil,
      price: priceNumber,
    });

    toSave.push({
      user_id: user.id,
      scryfall_id: card.id,
      name: card.name,
      set_code: card.set,
      collector_number: card.collector_number,
      quantity: (existingQty.get(key) ?? 0) + item.quantity,
      foil: item.foil,
      box: boxName,
      colors,
      color_identity: card.color_identity ?? [],
      type_line: card.type_line ?? null,
      mana_value: card.cmc ?? null,
      oracle_text: card.oracle_text ?? faces.map((f) => f.oracle_text ?? "").join("\n//\n"),
      rarity: card.rarity ?? null,
      image_url: card.image_uris?.normal ?? firstFace?.image_uris?.normal ?? null,
      price_usd: price,
    });
  }

  // 5. Save everything (adds new cards, updates quantities on existing ones)
  for (let i = 0; i < toSave.length; i += 500) {
    const { error } = await supabase
      .from("cards")
      .upsert(toSave.slice(i, i + 500), { onConflict: "user_id,scryfall_id,foil,box" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  valuable.sort((a, b) => b.price - a.price);

  return NextResponse.json({
    message: `Imported ${toSave.length} cards (${importedCopies} copies) into ${boxName}`,
    notFound,
    valuable,
    valuableThreshold: VALUABLE_PRICE,
    imported,
  });
}