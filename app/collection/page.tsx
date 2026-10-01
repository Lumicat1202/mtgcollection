"use client";

import { useEffect, useMemo, useState } from "react";

type Card = {
  id: string;
  name: string;
  set_code: string | null;
  quantity: number;
  foil: boolean;
  box: string;
  colors: string[];
  type_line: string | null;
  mana_value: number | null;
  image_url: string | null;
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
  const [preview, setPreview] = useState<string | null>(null);

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
    <main className="mx-auto max-w-4xl p-6">
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
      </div>

      {COLOR_ORDER.filter((color) => grouped[color]).map((color) => {
        const types = grouped[color];
        const count = Object.values(types).flat().reduce((sum, c) => sum + c.quantity, 0);
        const isCollapsed = collapsed.has(color);

        return (
          <section key={color} className={`mb-6 border-l-4 pl-4 ${COLOR_ACCENTS[color]}`}>
            <button onClick={() => toggle(color)} className="mb-2 text-xl font-semibold">
              {isCollapsed ? "▸" : "▾"} {color}{" "}
              <span className="text-sm font-normal text-gray-500">({count})</span>
            </button>

            {!isCollapsed &&
              TYPE_ORDER.filter((type) => types[type]).map((type) => (
                <div key={type} className="mb-4">
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {type} ({types[type].reduce((s, c) => s + c.quantity, 0)})
                  </h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {types[type].map((card) => (
                        <tr
                          key={card.id}
                          onMouseEnter={() => setPreview(card.image_url)}
                          onMouseLeave={() => setPreview(null)}
                          className="border-b border-gray-700/30 hover:bg-gray-500/10"
                        >
                          <td className="w-10 py-1">{card.quantity}x</td>
                          <td className="py-1">
                            {card.name}
                            {card.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
                          </td>
                          <td className="w-16 py-1 text-gray-500">MV {card.mana_value ?? 0}</td>
                          <td className="w-16 py-1 uppercase text-gray-500">{card.set_code}</td>
                          <td className="w-24 py-1 text-right text-gray-500">{card.box}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </section>
        );
      })}

      {Object.keys(grouped).length === 0 && (
        <p className="text-gray-500">No cards match. Try a different search or box.</p>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="pointer-events-none fixed bottom-6 right-6 hidden w-60 rounded-xl shadow-2xl md:block"
        />
      )}
    </main>
  );
}