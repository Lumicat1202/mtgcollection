"use client";

import { useEffect, useMemo, useState } from "react";

type Card = {
  id: string;
  name: string;
  set_code: string | null;
  collector_number: string | null;
  quantity: number;
  foil: boolean;
  box: string;
  colors: string[];
  type_line: string | null;
  mana_value: number | null;
  oracle_text: string | null;
  rarity: string | null;
  image_url: string | null;
  price_usd: number | null;
};

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
const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"];

function colorGroup(card: Card) {
  const colors = card.colors ?? [];
  if (colors.length > 1) return "Multicolor";
  if (colors.length === 1) return COLOR_NAMES[colors[0]] ?? "Colorless";
  if ((card.type_line ?? "").includes("Land")) return "Lands";
  return "Colorless";
}

function typeGroup(card: Card) {
  const frontFace = (card.type_line ?? "").split("//")[0];
  return TYPE_ORDER.find((t) => frontFace.includes(t)) ?? "Other";
}

export default function CollectionPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [boxFilter, setBoxFilter] = useState("All boxes");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Card | null>(null);

  useEffect(() => {
    fetch("/api/cards")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setCards(data.cards);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Close the card close-up with the Escape key
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const boxes = useMemo(
    () => ["All boxes", ...Array.from(new Set(cards.map((c) => c.box))).sort()],
    [cards]
  );

  // Filter, then group into color -> type -> cards
  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = cards.filter(
      (c) =>
        (boxFilter === "All boxes" || c.box === boxFilter) &&
        (!term || c.name.toLowerCase().includes(term))
    );

    const groups: Record<string, Record<string, Card[]>> = {};
    for (const card of filtered) {
      const color = colorGroup(card);
      const type = typeGroup(card);
      groups[color] ??= {};
      groups[color][type] ??= [];
      groups[color][type].push(card);
    }

    for (const color of Object.values(groups)) {
      for (const list of Object.values(color)) {
        list.sort(
          (a, b) => (a.mana_value ?? 0) - (b.mana_value ?? 0) || a.name.localeCompare(b.name)
        );
      }
    }
    return groups;
  }, [cards, search, boxFilter]);

  const totalCopies = cards.reduce((sum, c) => sum + c.quantity, 0);

  function toggle(color: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  }

  if (loading) return <p className="p-6">Loading your collection...</p>;
  if (error) return <p className="p-6 text-red-500">Error: {error}</p>;

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="text-2xl font-bold">My Collection</h1>
      <p className="mb-6 text-sm text-gray-500">
        {cards.length} unique cards, {totalCopies} total copies
      </p>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="flex-1 rounded border border-gray-400 bg-transparent px-3 py-2"
        />
        <select
          value={boxFilter}
          onChange={(e) => setBoxFilter(e.target.value)}
          className="rounded border border-gray-400 bg-transparent px-3 py-2"
        >
          {boxes.map((b) => (
            <option key={b} value={b} className="text-black">
              {b}
            </option>
          ))}
        </select>
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

      {COLOR_ORDER.filter((color) => grouped[color]).map((color) => {
        const types = grouped[color];
        const count = Object.values(types).flat().reduce((sum, c) => sum + c.quantity, 0);
        const isCollapsed = collapsed.has(color);

        return (
          <section key={color} className={`mb-8 border-l-4 pl-4 ${COLOR_ACCENTS[color]}`}>
            <button onClick={() => toggle(color)} className="mb-2 text-xl font-semibold">
              {isCollapsed ? "▸" : "▾"} {color}{" "}
              <span className="text-sm font-normal text-gray-500">({count})</span>
            </button>

            {!isCollapsed &&
              TYPE_ORDER.filter((type) => types[type]).map((type) => (
                <div key={type} className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {type} ({types[type].reduce((s, c) => s + c.quantity, 0)})
                  </h3>

                  {view === "grid" ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {types[type].map((card) => (
                        <button
                          key={card.id}
                          onClick={() => setSelected(card)}
                          className="group text-left"
                        >
                          <div className="relative">
                            {card.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={card.image_url}
                                alt={card.name}
                                loading="lazy"
                                className="w-full rounded-lg shadow transition group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="flex aspect-[488/680] items-center justify-center rounded-lg border border-gray-400 p-2 text-center text-sm">
                                {card.name}
                              </div>
                            )}
                            {card.quantity > 1 && (
                              <span className="absolute bottom-2 right-2 rounded-full bg-black/80 px-2 py-0.5 text-xs font-bold text-white">
                                {card.quantity}x
                              </span>
                            )}
                            {card.foil && (
                              <span className="absolute bottom-2 left-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
                                Foil
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs text-gray-500">{card.box}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <table className="w-full table-fixed text-sm">
                      <tbody>
                        {types[type].map((card) => (
                          <tr
                            key={card.id}
                            onClick={() => setSelected(card)}
                            className="cursor-pointer border-b border-gray-700/30 hover:bg-gray-500/10"
                          >
                            <td className="w-10 py-1">{card.quantity}x</td>
                            <td className="truncate py-1 pr-3">
                              {card.name}
                              {card.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
                            </td>
                            <td className="w-16 whitespace-nowrap py-1 text-gray-500">MV {card.mana_value ?? 0}</td>
                            <td className="w-14 py-1 uppercase text-gray-500">{card.set_code}</td>
                            <td className="w-36 truncate py-1 text-right text-gray-500">{card.box}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
          </section>
        );
      })}

      {Object.keys(grouped).length === 0 && (
        <p className="text-gray-500">No cards match. Try a different search or box.</p>
      )}

      {/* Card close-up */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-full w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 text-black shadow-2xl dark:bg-gray-900 dark:text-white"
          >
            <div className="flex flex-col gap-5 sm:flex-row">
              {selected.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.image_url}
                  alt={selected.name}
                  className="w-full rounded-xl sm:w-72"
                />
              )}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-2xl font-bold">{selected.name}</h2>
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

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-500">Box</dt>
                  <dd>{selected.box}</dd>
                  <dt className="text-gray-500">You own</dt>
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
                  <dt className="text-gray-500">Price</dt>
                  <dd>
                    {selected.price_usd != null ? `$${Number(selected.price_usd).toFixed(2)}` : "—"}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}