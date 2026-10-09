import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";

// What a valid Scryfall ID looks like
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type ImportRow = { scryfall_id: string; quantity: number; foil: boolean };

// Compare a file to a box: which cards from the file aren't in the box at all?
export async function POST(request: Request) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { box, rows } = (await request.json()) as { box?: string; rows?: ImportRow[] };
  const boxName = String(box || "").trim();

  if (!boxName) return NextResponse.json({ error: "Choose a box first" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No cards to check" }, { status: 400 });
  }

  // 1. Each different card in the file (same printing + same foil counts once)
  const wanted = new Map<string, { scryfall_id: string; foil: boolean }>();
  for (const row of rows) {
    const id = String(row.scryfall_id ?? "").trim().toLowerCase();
    if (!SCRYFALL_ID.test(id)) continue;
    const foil = Boolean(row.foil);
    wanted.set(`${id}|${foil}`, { scryfall_id: id, foil });
  }
  const uniqueIds = Array.from(new Set(Array.from(wanted.values()).map((w) => w.scryfall_id)));

  // 2. Which of them are already in the box
  const inBox = new Set<string>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const { data, error } = await supabase
      .from("cards")
      .select("scryfall_id, foil")
      .eq("user_id", user.id)
      .eq("box", boxName)
      .in("scryfall_id", uniqueIds.slice(i, i + 100));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data) inBox.add(`${row.scryfall_id}|${row.foil}`);
  }

  // 3. The rest are missing
  const missing = Array.from(wanted.entries())
    .filter(([key]) => !inBox.has(key))
    .map(([, card]) => card);

  return NextResponse.json({ missing, checked: wanted.size });
}