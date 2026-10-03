"use client";

import { useEffect, useMemo, useState } from "react";

// Cards worth this much or more get the gold $$ badge
const VALUABLE_PRICE = 5;

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

type SortBy = "mv" | "price" | "name";

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

function priceOf(card: Card) {
  return card.price_usd != null ? Number(card.price_usd) : 0;
}

function isValuable(card: Card) {
  return priceOf(card) >= VALUABLE_PRICE;
}

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function ValueBadge() {
  return (
    <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-extrabold text-black shadow">$$</span>
  );
}

async function fetchCards(): Promise<Card[]> {
  const res = await fetch("/api/cards");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.cards;
}

export default function CollectionPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [boxFilter, setBoxFilter] = useState("All boxes");
  const [sortBy, setSortBy] = useState<SortBy>("mv");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Card | null>(null);

  // Prices
  const [refreshing, setRefreshing] = useState(false);
  const [priceMsg, setPriceMsg] = useState<string | null>(null);

  // Manage panel
  const [busy, setBusy] = useState(false);
  const [manageMsg, setManageMsg] = useState<string | null>(null);
  const [moveBox, setMoveBox] = useState("");
  const [moveCount, setMoveCount] = useState(1);

  useEffect(() => {
    fetchCards()
      .then(setCards)
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

    const compare = (a: Card, b: Card) => {
      if (sortBy === "price") return priceOf(b) - priceOf(a) || a.name.localeCompare(b.name);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return (a.mana_value ?? 0) - (b.mana_value ?? 0) || a.name.localeCompare(b.name);
    };

    for (const color of Object.values(groups)) {
      for (const list of Object.values(color)) list.sort(compare);
    }
    return groups;
  }, [cards, search, boxFilter, sortBy]);

  const totalCopies = cards.reduce((sum, c) => sum + c.quantity, 0);
  const totalValue = cards.reduce((sum, c) => sum + priceOf(c) * c.quantity, 0);

  const mostValuable = useMemo(
    () =>
      [...cards]
        .filter((c) => priceOf(c) > 0)
        .sort((a, b) => priceOf(b) - priceOf(a))
        .slice(0, 10),
    [cards]
  );

  function toggle(color: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  }

  function openCard(card: Card) {
    setSelected(card);
    setManageMsg(null);
    setMoveBox("");
    setMoveCount(1);
  }

  async function refreshPrices() {
    setRefreshing(true);
    setPriceMsg(null);
    try {
      const res = await fetch("/api/prices", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Price refresh failed");
      setCards(await fetchCards());
      setPriceMsg(`Checked ${data.checked} cards, ${data.updated} prices changed.`);
    } catch (err) {
      setPriceMsg(err instanceof Error ? err.message : "Price refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function changeQuantity(card: Card, newQty: number) {
    if (newQty < 1) return deleteCard(card);
    setBusy(true);
    setManageMsg(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setCards((prev) => prev.map((c) => (c.id === card.id ? data.card : c)));
      setSelected(data.card);
    } catch (err) {
      setManageMsg(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function moveCard(card: Card) {
    setBusy(true);
    setManageMsg(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move: { toBox: moveBox, count: moveCount } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Move failed");

      const fresh = await fetchCards();
      setCards(fresh);
      setSelected(fresh.find((c) => c.id === card.id) ?? null);
      setManageMsg(`Moved ${data.moved} to ${data.toBox}`);
      setMoveBox("");
      setMoveCount(1);
    } catch (err) {
      setManageMsg(err instanceof Error ? err.message : "Move failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCard(card: Card) {
    const copies = card.quantity === 1 ? "" : `all ${card.quantity} copies of `;
    if (!confirm(`Delete ${copies}${card.name} from ${card.box}?`)) return;
    setBusy(true);
    setManageMsg(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setSelected(null);
    } catch (err) {
      setManageMsg(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-6">Loading your collection...</p>;
  if (error) return <p className="p-6 text-red-500">Error: {error}</p>;

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      {/* Header with total value */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Collection</h1>
          <p className="text-sm text-gray-500">
            {cards.length} unique cards · {totalCopies} total copies
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Collection value</p>
          <p className="text-3xl font-bold text-green-500">{money(totalValue)}</p>
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            className="mt-1 text-sm text-blue-500 hover:underline disabled:opacity-50"
          >
            {refreshing ? "Refreshing prices..." : "🔄 Refresh prices"}
          </button>
        </div>
      </div>
      {priceMsg && <p className="mb-4 text-right text-sm text-gray-500">{priceMsg}</p>}

      {/* Most valuable */}
      {mostValuable.length > 0 && (
        <div className="mb-8 rounded-lg border border-gray-400/40 p-4">
          <h2 className="mb-3 font-semibold">💎 Most valuable</h2>
          <ol className="grid gap-x-6 text-sm sm:grid-cols-2">
            {mostValuable.map((card, i) => (
              <li key={card.id}>
                <button
                  onClick={() => openCard(card)}
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

      {/* Controls */}
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
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded border border-gray-400 bg-transparent px-3 py-2"
        >
          <option value="mv" className="text-black">Sort: Mana value</option>
          <option value="price" className="text-black">Sort: Price (high to low)</option>
          <option value="name" className="text-black">Sort: Name</option>
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
        const allInColor = Object.values(types).flat();
        const count = allInColor.reduce((sum, c) => sum + c.quantity, 0);
        const value = allInColor.reduce((sum, c) => sum + priceOf(c) * c.quantity, 0);
        const isCollapsed = collapsed.has(color);

        return (
          <section key={color} className={`mb-8 border-l-4 pl-4 ${COLOR_ACCENTS[color]}`}>
            <button onClick={() => toggle(color)} className="mb-2 text-xl font-semibold">
              {isCollapsed ? "▸" : "▾"} {color}{" "}
              <span className="text-sm font-normal text-gray-500">
                ({count}) · {money(value)}
              </span>
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
                        <button key={card.id} onClick={() => openCard(card)} className="group text-left">
                          <div className="relative">
                            {card.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={card.image_url}
                                alt={card.name}
                                loading="lazy"
                                className={`w-full rounded-lg shadow transition group-hover:scale-[1.03] ${
                                  isValuable(card) ? "ring-4 ring-yellow-400" : ""
                                }`}
                              />
                            ) : (
                              <div
                                className={`flex aspect-[488/680] items-center justify-center rounded-lg border p-2 text-center text-sm ${
                                  isValuable(card) ? "border-yellow-400 ring-4 ring-yellow-400" : "border-gray-400"
                                }`}
                              >
                                {card.name}
                              </div>
                            )}
                            {isValuable(card) && (
                              <span className="absolute right-2 top-2">
                                <ValueBadge />
                              </span>
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
                          <p className="mt-1 flex justify-between gap-2 text-xs">
                            <span className="truncate text-gray-500">{card.box}</span>
                            <span
                              className={`whitespace-nowrap font-semibold ${
                                isValuable(card) ? "text-yellow-500" : "text-green-500"
                              }`}
                            >
                              {priceOf(card) > 0 ? money(priceOf(card)) : "—"}
                            </span>
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <table className="w-full table-fixed text-sm">
                      <tbody>
                        {types[type].map((card) => (
                          <tr
                            key={card.id}
                            onClick={() => openCard(card)}
                            className={`cursor-pointer border-b border-gray-700/30 hover:bg-gray-500/10 ${
                              isValuable(card) ? "bg-yellow-400/10" : ""
                            }`}
                          >
                            <td className="w-10 py-1">{card.quantity}x</td>
                            <td className="truncate py-1 pr-3">
                              {card.name}
                              {card.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
                              {isValuable(card) && (
                                <span className="ml-2">
                                  <ValueBadge />
                                </span>
                              )}
                            </td>
                            <td className="w-16 whitespace-nowrap py-1 text-gray-500">MV {card.mana_value ?? 0}</td>
                            <td className="w-14 py-1 uppercase text-gray-500">{card.set_code}</td>
                            <td
                              className={`w-20 whitespace-nowrap py-1 pr-3 text-right ${
                                isValuable(card) ? "font-bold text-yellow-500" : "text-green-500"
                              }`}
                            >
                              {priceOf(card) > 0 ? money(priceOf(card)) : "—"}
                            </td>
                            <td className="w-32 truncate py-1 text-right text-gray-500">{card.box}</td>
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
                  className={`w-full self-start rounded-xl sm:w-72 ${
                    isValuable(selected) ? "ring-4 ring-yellow-400" : ""
                  }`}
                />
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

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-500">Box</dt>
                  <dd>{selected.box}</dd>
                  <dt className="text-gray-500">Mana value</dt>
                  <dd>{selected.mana_value ?? 0}</dd>
                  <dt className="text-gray-500">Set</dt>
                  <dd className="uppercase">
                    {selected.set_code} #{selected.collector_number}
                  </dd>
                  <dt className="text-gray-500">Rarity</dt>
                  <dd className="capitalize">{selected.rarity}</dd>
                  <dt className="text-gray-500">Price each</dt>
                  <dd>
                    {priceOf(selected) > 0 ? money(priceOf(selected)) : "No price listed"}
                    {selected.foil ? " (foil)" : ""}
                  </dd>
                  <dt className="text-gray-500">Total value</dt>
                  <dd className="font-semibold text-green-500">
                    {money(priceOf(selected) * selected.quantity)}
                    {selected.quantity > 1 && (
                      <span className="font-normal text-gray-500"> ({selected.quantity} copies)</span>
                    )}
                  </dd>
                </dl>

                {/* Manage */}
                <div className="mt-5 border-t border-gray-500/30 pt-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Manage</h3>

                  <div className="mb-4 flex items-center gap-3">
                    <span className="w-20 text-sm text-gray-500">Quantity</span>
                    <button
                      disabled={busy}
                      onClick={() => changeQuantity(selected, selected.quantity - 1)}
                      className="h-8 w-8 rounded border border-gray-400 text-lg hover:bg-gray-500/10 disabled:opacity-50"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-semibold">{selected.quantity}</span>
                    <button
                      disabled={busy}
                      onClick={() => changeQuantity(selected, selected.quantity + 1)}
                      className="h-8 w-8 rounded border border-gray-400 text-lg hover:bg-gray-500/10 disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="w-20 text-sm text-gray-500">Move</span>
                    <input
                      type="number"
                      min={1}
                      max={selected.quantity}
                      value={moveCount}
                      onChange={(e) => setMoveCount(Number(e.target.value))}
                      className="w-16 rounded border border-gray-400 bg-transparent px-2 py-1.5 text-sm"
                    />
                    <span className="text-sm">to</span>
                    <input
                      list="box-options"
                      value={moveBox}
                      onChange={(e) => setMoveBox(e.target.value)}
                      placeholder="Box name"
                      className="min-w-0 flex-1 rounded border border-gray-400 bg-transparent px-2 py-1.5 text-sm"
                    />
                    <datalist id="box-options">
                      {boxes
                        .filter((b) => b !== "All boxes" && b !== selected.box)
                        .map((b) => (
                          <option key={b} value={b} />
                        ))}
                    </datalist>
                    <button
                      disabled={busy || !moveBox.trim() || moveBox.trim() === selected.box}
                      onClick={() => moveCard(selected)}
                      className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Move
                    </button>
                  </div>

                  <button
                    disabled={busy}
                    onClick={() => deleteCard(selected)}
                    className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    🗑️ Delete from collection
                  </button>

                  {manageMsg && <p className="mt-3 text-sm text-gray-500">{manageMsg}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}