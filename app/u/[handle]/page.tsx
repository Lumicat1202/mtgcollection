"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CardTiles, { type Card, priceOf, money, isValuable, ValueBadge } from "@/components/CardTiles";
import { TYPE_ORDER, typeOf } from "@/lib/box-layout";
import { createClient } from "@/lib/supabase-browser";

type PublicProfile = { handle: string; show_prices: boolean };

const COLOR_ORDER = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"];
const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const COLOR_ACCENTS: Record<string, string> = {
  White: "border-yellow-200",
  Blue: "border-blue-500",
  Black: "border-gray-500",
  Red: "border-red-500",
  Green: "border-green-500",
  Multicolor: "border-amber-400",
  Colorless: "border-gray-300",
  Lands: "border-orange-800",
};

function colorGroup(card: Card) {
  const colors = card.colors ?? [];
  if (colors.length > 1) return "Multicolor";
  if (colors.length === 1) return COLOR_NAMES[colors[0]] ?? "Colorless";
  if ((card.type_line ?? "").includes("Land")) return "Lands";
  return "Colorless";
}

const copiesOf = (list: Card[]) => list.reduce((sum, c) => sum + c.quantity, 0);
const valueOf = (list: Card[]) => list.reduce((sum, c) => sum + priceOf(c) * c.quantity, 0);

export default function PublicCollectionPage() {
  const params = useParams<{ handle: string }>();
  const handle = decodeURIComponent(params.handle ?? "").toLowerCase();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [notShared, setNotShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Card | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));

    (async () => {
      // Is this collection shared?
      const { data: profiles, error: profileError } = await supabase.rpc("public_profile", {
        p_handle: handle,
      });
      if (profileError) throw new Error(profileError.message);
      const found = (profiles as PublicProfile[] | null)?.[0];
      if (!found) {
        setNotShared(true);
        return;
      }
      setProfile(found);

      // Load its cards, 1000 at a time
      const all: Card[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: cardsError } = await supabase
          .rpc("public_collection", { p_handle: handle })
          .range(from, from + 999);
        if (cardsError) throw new Error(cardsError.message);
        const page = (data ?? []) as Omit<Card, "box">[];
        all.push(...page.map((c) => ({ ...c, box: "" })));
        if (page.length < 1000) break;
      }
      setCards(all);
    })()
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [handle]);

  // Close the close-up with the Escape key
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term ? cards.filter((c) => c.name.toLowerCase().includes(term)) : cards;
    const groups: Record<string, Record<string, Card[]>> = {};
    for (const card of filtered) {
      const color = colorGroup(card);
      const type = typeOf(card);
      groups[color] ??= {};
      groups[color][type] ??= [];
      groups[color][type].push(card);
    }
    for (const color of Object.values(groups)) {
      for (const list of Object.values(color)) {
        list.sort((a, b) => (a.mana_value ?? 0) - (b.mana_value ?? 0) || a.name.localeCompare(b.name));
      }
    }
    return groups;
  }, [cards, search]);

  const mostValuable = useMemo(
    () =>
      [...cards]
        .filter((c) => priceOf(c) > 0)
        .sort((a, b) => priceOf(b) - priceOf(a))
        .slice(0, 10),
    [cards]
  );

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <p className="p-6">Loading collection...</p>;

  if (notShared) {
    return (
      <main className="mx-auto w-full max-w-xl p-6 text-center">
        <h1 className="mb-2 text-2xl font-bold">Collection not found</h1>
        <p className="mb-6 text-gray-500">
          There&apos;s no shared collection at this link. It may be private, or the link name may be different.
        </p>
        <Link href="/login" className="rounded bg-blue-600 px-4 py-2 font-semibold text-white">
          Start your own collection
        </Link>
      </main>
    );
  }

  if (error || !profile) return <p className="p-6 text-red-500">Error: {error ?? "Something went wrong"}</p>;

  const showPrices = profile.show_prices;

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      {!signedIn && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-yellow-400/40 bg-yellow-400/10 p-4">
          <p className="text-sm">
            Track your own Magic cards, see what they&apos;re worth, and build decks from what you own.
          </p>
          <Link href="/login" className="whitespace-nowrap rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
            Create a free account
          </Link>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{profile.handle}&apos;s collection</h1>
          <p className="text-sm text-gray-500">
            {cards.length} unique cards, {copiesOf(cards)} total copies
          </p>
        </div>
        {showPrices && (
          <div className="text-right">
            <p className="text-sm text-gray-500">Collection value</p>
            <p className="text-3xl font-bold text-green-500">{money(valueOf(cards))}</p>
          </div>
        )}
      </div>

      {showPrices && mostValuable.length > 0 && (
        <div className="mb-8 rounded-lg border border-gray-400/40 p-4">
          <h2 className="mb-3 font-semibold">💎 Most valuable</h2>
          <ol className="grid gap-x-6 text-sm sm:grid-cols-2">
            {mostValuable.map((card, i) => (
              <li key={card.id}>
                <button
                  onClick={() => setSelected(card)}
                  className="flex w-full items-center justify-between gap-2 border-b border-gray-700/30 py-1 text-left hover:bg-gray-500/10"
                >
                  <span className="truncate">
                    <span className="text-gray-500">{i + 1}.</span> {card.name}
                    {card.foil && <span className="ml-1 text-xs text-amber-400">foil</span>}
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap font-semibold text-green-500">
                    {isValuable(card) && <ValueBadge />}
                    {money(priceOf(card))}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="flex-1 rounded border border-gray-400 bg-transparent px-3 py-2"
        />
        <div className="flex overflow-hidden rounded border border-gray-400">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm ${view === v ? "bg-blue-600 text-white" : "hover:bg-gray-500/10"}`}
            >
              {v === "grid" ? "🖼️ Grid" : "☰ List"}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(grouped).length === 0 && <p className="text-gray-500">No cards match that search.</p>}

      {COLOR_ORDER.filter((color) => grouped[color]).map((color) => {
        const types = grouped[color];
        const allInColor = Object.values(types).flat();
        const isCollapsed = collapsed.has(color);

        return (
          <section key={color} className={`mb-8 border-l-4 pl-4 ${COLOR_ACCENTS[color]}`}>
            <button onClick={() => toggle(color)} className="mb-2 text-xl font-semibold">
              {isCollapsed ? "▸" : "▾"} {color}{" "}
              <span className="text-sm font-normal text-gray-500">
                ({copiesOf(allInColor)}){showPrices ? ` · ${money(valueOf(allInColor))}` : ""}
              </span>
            </button>

            {!isCollapsed &&
              TYPE_ORDER.filter((type) => types[type]).map((type) => (
                <div key={type} className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-500">
                    {type} ({copiesOf(types[type])})
                  </h3>
                  <CardTiles cards={types[type]} view={view} onOpen={setSelected} hidePrices={!showPrices} />
                </div>
              ))}
          </section>
        );
      })}

      {/* View-only card close-up */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-full w-full max-w-3xl overflow-y-auto rounded-xl bg-gray-900 p-5 text-white shadow-2xl"
          >
            <div className="flex flex-col gap-5 sm:flex-row">
              {selected.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.image_url} alt={selected.name} className="w-full self-start rounded-xl sm:w-72" />
              )}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                    {selected.name}
                    {isValuable(selected) && <ValueBadge />}
                  </h2>
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                    className="text-3xl leading-none text-gray-500 hover:text-gray-300"
                  >
                    ×
                  </button>
                </div>
                <p className="mb-3 text-sm text-gray-500">{selected.type_line}</p>

                {selected.oracle_text && (
                  <p className="mb-4 whitespace-pre-line rounded bg-gray-500/10 p-3 text-sm leading-relaxed">
                    {selected.oracle_text}
                  </p>
                )}

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-500">Copies</dt>
                  <dd>
                    {selected.quantity}
                    {selected.foil ? " (foil)" : ""}
                  </dd>
                  <dt className="text-gray-500">Mana value</dt>
                  <dd>{selected.mana_value ?? 0}</dd>
                  <dt className="text-gray-500">Set</dt>
                  <dd className="uppercase">
                    {selected.set_code} #{selected.collector_number}
                  </dd>
                  <dt className="text-gray-500">Rarity</dt>
                  <dd className="capitalize">{selected.rarity}</dd>
                  {showPrices && (
                    <>
                      <dt className="text-gray-500">Price each</dt>
                      <dd>{priceOf(selected) > 0 ? money(priceOf(selected)) : "No price listed"}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}