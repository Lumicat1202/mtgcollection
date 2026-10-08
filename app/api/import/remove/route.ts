import { NextResponse } from "next/server";
import { getUserAndClient } from "@/lib/supabase-server";

// What a valid Scryfall ID looks like
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type ImportRow = { scryfall_id: string; quantity: number; foil: boolean };

// Undo an import: subtract a file's cards from a box
export async function POST(request: Request) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

  const { box, rows } = (await request.json()) as { box?: string; rows?: ImportRow[] };
  const boxName = String(box || "").trim();

  if (!boxName) return NextResponse.json({ error: "Choose a box first" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No cards to remove" }, { status: 400 });
  }

  // 1. Add up how many of each card the file has
  const combined = new Map<string, { scryfall_id: string; foil: boolean; quantity: number }>();
  for (const row of rows) {
    const id = String(row.scryfall_id ?? "").trim().toLowerCase();
    if (!SCRYFALL_ID.test(id)) continue;
    const foil = Boolean(row.foil);
    const key = `${id}|${foil}`;
    const qty = Math.max(1, Number(row.quantity) || 1);
    const existing = combined.get(key);
    if (existing) existing.quantity += qty;
    else combined.set(key, { scryfall_id: id, foil, quantity: qty });
  }
  const uniqueIds = Array.from(new Set(Array.from(combined.values()).map((i) => i.scryfall_id)));

  // 2. Find those cards in the box
  const inBox = new Map<string, { id: string; quantity: number }>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, scryfall_id, foil, quantity")
      .eq("user_id", user.id)
      .eq("box", boxName)
      .in("scryfall_id", uniqueIds.slice(i, i + 100));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data) inBox.set(`${row.scryfall_id}|${row.foil}`, { id: row.id, quantity: row.quantity });
  }

  // 3. Work out the new quantities
  const toDelete: string[] = [];
  const toUpdate: { id: string; quantity: number }[] = [];
  let removedCopies = 0;
  let missing = 0;

  for (const [key, item] of combined) {
    const row = inBox.get(key);
    if (!row) {
      missing += 1;
      continue;
    }
    removedCopies += Math.min(row.quantity, item.quantity);
    const newQty = row.quantity - item.quantity;
    if (newQty <= 0) toDelete.push(row.id);
    else toUpdate.push({ id: row.id, quantity: newQty });
  }

  // 4. Save the changes
  for (let i = 0; i < toUpdate.length; i += 20) {
    const results = await Promise.all(
      toUpdate
        .slice(i, i + 20)
        .map((u) => supabase.from("cards").update({ quantity: u.quantity }).eq("id", u.id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  for (let i = 0; i < toDelete.length; i += 100) {
    const { error } = await supabase.from("cards").delete().in("id", toDelete.slice(i, i + 100));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let message = `Removed ${removedCopies} copies from ${boxName}`;
  if (toDelete.length) message += ` (${toDelete.length} cards are now gone completely)`;
  if (missing) message += `. ${missing} cards from the file weren't in ${boxName}, so they were skipped.`;

  return NextResponse.json({ message });
}