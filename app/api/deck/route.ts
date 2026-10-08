import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";
import { type Location, groupOf, placementLabel, rowFor } from "@/lib/box-layout";

// Deck building can take a while, so allow up to 5 minutes
export const maxDuration = 300;

const SCRYFALL_HEADERS = {
  "User-Agent": "MTGCollection/1.0",
  Accept: "application/json",
};

type OwnedCard = {
  name: string;
  box: string;
  colors: string[] | null;
  type_line: string | null;
  mana_value: number | null;
  oracle_text: string | null;
};

type DeckResult = {
  strategy: string;
  categories: { name: string; cards: string[] }[];
  basic_lands: Record<string, number>;
  gaps: { role: string; suggestion: string }[];
};

export async function POST(request: Request) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { commander, notes } = await request.json();
  if (!commander || typeof commander !== "string") {
    return NextResponse.json({ error: "Pick a commander first" }, { status: 400 });
  }

  // 1. Look up the commander on Scryfall
  const res = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commander)}`,
    { headers: SCRYFALL_HEADERS }
  );
  if (!res.ok) {
    return NextResponse.json({ error: `Couldn't find "${commander}"` }, { status: 404 });
  }
  const cmd = await res.json();
  const faces: { oracle_text?: string; image_uris?: { normal?: string } }[] = cmd.card_faces ?? [];
  const identity: string[] = cmd.color_identity ?? [];
  const cmdText = cmd.oracle_text ?? faces.map((f) => f.oracle_text ?? "").join("\n//\n");

  // 2. Get every card YOU own that fits inside the commander's colors
  const owned: OwnedCard[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("cards")
      .select("name, box, colors, type_line, mana_value, oracle_text")
      .eq("user_id", user.id)
      .containedBy("color_identity", identity)
      .order("id")
      .range(from, from + 999);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    owned.push(...(data as OwnedCard[]));
    if (data.length < 1000) break;
  }

  // 3. Your boxes, so we can say exactly where each card is
  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, kind, rows")
    .eq("user_id", user.id);
  const locationByName = new Map(((locationRows ?? []) as Location[]).map((l) => [l.name, l]));

  function spotLabel(card: OwnedCard) {
    const location = locationByName.get(card.box);
    return rowFor(groupOf(card), location) ? `${card.box} · ${placementLabel(card, location)}` : card.box;
  }

  // 4. One entry per card name, remembering every spot it's in
  const byName = new Map<string, { card: OwnedCard; spots: Set<string> }>();
  for (const card of owned) {
    if (card.name === cmd.name) continue;
    const entry = byName.get(card.name);
    if (entry) entry.spots.add(spotLabel(card));
    else byName.set(card.name, { card, spots: new Set([spotLabel(card)]) });
  }
  if (byName.size === 0) {
    return NextResponse.json(
      { error: `You don't own any cards that fit in ${cmd.name}'s colors yet` },
      { status: 400 }
    );
  }

  // 5. No API key yet? Stop here, but report what was found
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: `Almost ready! Found ${byName.size} cards you own that fit in ${cmd.name}'s colors. Add your Anthropic API key to finish setting up the deck builder.`,
      },
      { status: 503 }
    );
  }

  const cardList = Array.from(byName.values())
    .map(({ card }) => {
      const text = (card.oracle_text ?? "").replace(/\n/g, " ").slice(0, 220);
      return `${card.name} | ${card.type_line ?? ""} | MV ${card.mana_value ?? 0} | ${text}`;
    })
    .join("\n");

  // 6. Ask Claude to build the deck
  const prompt = `Build a Commander deck for this commander:
${cmd.name} - ${cmd.type_line}
${cmdText}
Color identity: ${identity.join("") || "Colorless"}

Player notes: ${notes?.trim() || "None"}

Rules:
- Choose cards ONLY from the collection list below. Use card names exactly as written.
- Singleton: each card at most once.
- Aim for roughly 36-38 lands, 10 ramp, 10 card draw, 8-10 removal/interaction, 2-3 board wipes, and the rest synergy with the commander. Adjust to fit the strategy and what the collection actually has.
- If the collection doesn't have enough lands, fill the rest with basic lands in "basic_lands".
- Your chosen cards plus basic lands should total exactly 99.
- In "gaps", name the roles where the collection is weak and suggest specific affordable cards to buy (cards NOT in the collection).

Respond with ONLY valid JSON, no other text, in this exact shape:
{"strategy": "2-3 sentences on how the deck plays", "categories": [{"name": "Ramp", "cards": ["Card Name"]}], "basic_lands": {"Swamp": 10}, "gaps": [{"role": "Removal", "suggestion": "Specific cards to consider"}]}

Collection (name | type | mana value | rules text):
${cardList}`;

  let deck: DeckResult;
  try {
    const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 8000,
      system:
        "You are an expert Magic: The Gathering Commander deck builder. You build decks only from the player's own collection.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    deck = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Deck building failed: ${msg}` }, { status: 500 });
  }

  // 7. Keep only cards you really own, no duplicates, and attach exact spots
  const seen = new Set<string>();
  const categories = (deck.categories ?? [])
    .map((cat) => ({
      name: cat.name,
      cards: (cat.cards ?? [])
        .filter((name) => byName.has(name) && !seen.has(name) && seen.add(name))
        .map((name) => {
          const { card, spots } = byName.get(name)!;
          return {
            name,
            box: card.box,
            spots: Array.from(spots),
            colors: card.colors ?? [],
            type_line: card.type_line,
            mana_value: card.mana_value,
          };
        }),
    }))
    .filter((cat) => cat.cards.length > 0);

  const basicLands = deck.basic_lands ?? {};
  const basicCount = Object.values(basicLands).reduce((sum, n) => sum + (Number(n) || 0), 0);

  return NextResponse.json({
    commander: {
      name: cmd.name,
      image: cmd.image_uris?.normal ?? faces[0]?.image_uris?.normal ?? null,
      identity,
    },
    strategy: deck.strategy,
    categories,
    basic_lands: basicLands,
    gaps: deck.gaps ?? [],
    total: seen.size + basicCount,
    ownedInColors: byName.size,
  });
}