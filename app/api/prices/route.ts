import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Refreshing a big collection can take a little while
export const maxDuration = 300;

const SCRYFALL_HEADERS = {
  "User-Agent": "MTGCollection/1.0",
  Accept: "application/json",
  "Content-Type": "application/json",
};

type Prices = { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
type Row = {
  id: string;
  scryfall_id: string;
  foil: boolean;
  price_usd: number | string | null;
} & Record<string, unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST() {
  // 1. Load every card you own
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .order("id")
      .range(from, from + 999);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  // 2. Get the latest prices from Scryfall, 75 cards per request
  const ids = Array.from(new Set(rows.map((r) => r.scryfall_id)));
  const pricesById = new Map<string, Prices>();

  for (let i = 0; i < ids.length; i += 75) {
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: SCRYFALL_HEADERS,
      body: JSON.stringify({ identifiers: ids.slice(i, i + 75).map((id) => ({ id })) }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Scryfall request failed (${res.status})` }, { status: 502 });
    }
    const data = await res.json();
    for (const card of data.data as { id: string; prices?: Prices }[]) {
      pricesById.set(card.id, card.prices ?? {});
    }
    await sleep(100);
  }

  // 3. Only save cards whose price actually changed
  const changed: Row[] = [];
  for (const row of rows) {
    const prices = pricesById.get(row.scryfall_id);
    if (!prices) continue;
    const raw = row.foil ? prices.usd_foil ?? prices.usd_etched ?? null : prices.usd ?? null;
    const newPrice = raw === null ? null : Number(raw);
    const oldPrice = row.price_usd === null ? null : Number(row.price_usd);
    if (newPrice !== oldPrice) changed.push({ ...row, price_usd: newPrice });
  }

  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await supabase
      .from("cards")
      .upsert(changed.slice(i, i + 500), { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ checked: rows.length, updated: changed.length });
}