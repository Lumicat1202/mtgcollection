"use client";

import { useEffect, useMemo, useState } from "react";
import CardTiles, { type Card, priceOf, isValuable, money, ValueBadge } from "@/components/CardTiles";
import {
  type GroupCode,
  type Location,
  TYPE_ORDER,
  buildBoxView,
  groupOf,
  placementLabel,
  rowFor,
  typeOf,
} from "@/lib/box-layout";

type SortBy = "mv" | "price" | "name";

const WHOLE_COLLECTION = "__all__";

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
const GROUP_ACCENTS: Record<GroupCode, string> = {
  W: "border-yellow-200",
  U: "border-blue-500",
  B: "border-gray-500",
  R: "border-red-500",
  G: "border-green-500",
  C: "border-gray-300",
  BASIC: "border-orange-800",
  LANDS: "border-orange-500",
  TOKENS: "border-purple-400",
  MULTI: "border-amber-400",
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

async function fetchCards(): Promise<Card[]> {
  const res = await fetch("/api/cards");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.cards;
}

async function fetchLocations(): Promise<Location[]> {
  const res = await fetch("/api/locations");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.locations;
}

export default function CollectionPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [boxFilter, setBoxFilter] = useState(WHOLE_COLLECTION);
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
    Promise.all([fetchCards(), fetchLocations()])
      .then(([cardList, locationList]) => {
        setCards(cardList);
        setLocations(locationList);
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

  const locationByName = useMemo(() => new Map(locations.map((l) => [l.name, l])), [locations]);

  // Your boxes first (in the order you made them), then any other names cards use
  const boxNames = useMemo(() => {
    const names = locations.map((l) => l.name);
    for (const card of cards) if (!names.includes(card.box)) names.push(card.box);
    return names;
  }, [locations, cards]);

  const selectedLocation = boxFilter === WHOLE_COLLECTION ? null : locationByName.get(boxFilter) ?? null;

  // Short location for card captions, like "Main Box · Row 2"
  function shortLocation(card: Card) {
    const row = rowFor(groupOf(card), locationByName.get(card.box));
    return row ? `${card.box} · Row ${row}` : card.box;
  }

  // Full location for the close-up, like "Main Box · Row 2 · Black · Sorcery"
  function fullLocation(card: Card) {
    const location = locationByName.get(card.box);
    return rowFor(groupOf(card), location) ? `${card.box} · ${placementLabel(card, location)}` : card.box;
  }

  // Cards in the chosen scope (whole collection or one box), before searching
  const scopeCards = useMemo(
    () => (boxFilter === WHOLE_COLLECTION ? cards : cards.filter((c) => c.box === boxFilter)),
    [cards, boxFilter]
  );

  // Then apply the search
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? scopeCards.filter((c) => c.name.toLowerCase().includes(term)) : scopeCards;
  }, [scopeCards, search]);

  // Box view: row by row, exactly like the real box
  const boxView = useMemo(
    () => (selectedLocation?.kind === "box" ? buildBoxView(filtered, selectedLocation) : null),
    [filtered, selectedLocation]
  );

  // Whole collection view: color -> type -> cards
  const grouped = useMemo(() => {
    const groups: Record<string, Record<string, Card[]>> = {};
    for (const card of filtered) {
      const color = colorGroup(card);
      const type = typeOf(card);
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
  }, [filtered, sortBy]);

  const mostValuable = useMemo(
    () =>
      [...scopeCards]
        .filter((c) => priceOf(c) > 0)
        .sort((a, b) => priceOf(b) - priceOf(a))
        .slice(0, 10),
    [scopeCards]
  );

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

  const scopeLabel = boxFilter === WHOLE_COLLECTION ? "Collection value" : `${boxFilter} value`;
  const nothingMatches = filtered.length === 0;

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      {/* Header with value */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {boxFilter === WHOLE_COLLECTION ? "My Collection" : boxFilter}
          </h1>
          <p className="text-sm text-gray-500">
            {scopeCards.length} unique cards, {copiesOf(scopeCards)} total copies
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">{scopeLabel}</p>
          <p className="text-3xl font-bold text-green-500">{money(valueOf(scopeCards))}</p>
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            className="mt-1 text-sm text-blue-400 hover:underline disabled:opacity-50"
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
          <option value={WHOLE_COLLECTION} className="text-black">
            Whole collection
          </option>
          {boxNames.map((name) => (
            <option key={name} value={name} className="text-black">
              {name}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          disabled={!!boxView}
          title={boxView ? "Box view always follows the order of your box" : undefined}
          className="rounded border border-gray-400 bg-transparent px-3 py-2 disabled:opacity-50"
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

      {nothingMatches && <p className="text-gray-500">No cards match. Try a different search or box.</p>}

      {/* ---------- Box view: row by row ---------- */}
      {boxView && (
        <>
          {boxView.rows.map((row) => {
            const rowCards = row.groups.flatMap((g) => g.sections.flatMap((s) => s.cards));
            if (rowCards.length === 0) return null;
            const key = `row-${row.row}`;
            const isCollapsed = collapsed.has(key);

            return (
              <section key={key} className="mb-10">
                <button onClick={() => toggle(key)} className="mb-4 text-2xl font-semibold">
                  {isCollapsed ? "▸" : "▾"} Row {row.row}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    ({copiesOf(rowCards)}) · {money(valueOf(rowCards))}
                  </span>
                </button>

                {!isCollapsed &&
                  row.groups.map((g) => (
                    <div key={g.group} className={`mb-8 border-l-4 pl-4 ${GROUP_ACCENTS[g.group]}`}>
                      <h3 className="mb-3 text-lg font-semibold">{g.title}</h3>
                      {g.sections.map((section) => (
                        <div key={section.title || g.group} className="mb-5">
                          {section.title && (
                            <h4 className="mb-2 text-sm font-semibold text-gray-500">
                              {section.title} ({copiesOf(section.cards)})
                            </h4>
                          )}
                          <CardTiles cards={section.cards} view={view} onOpen={openCard} />
                        </div>
                      ))}
                    </div>
                  ))}
              </section>
            );
          })}

          {boxView.unplaced.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-1 text-xl font-semibold">Not assigned to a row</h2>
              <p className="mb-3 text-sm text-gray-500">
                This box&apos;s rows don&apos;t include a spot for these cards yet.
              </p>
              <CardTiles cards={boxView.unplaced} view={view} onOpen={openCard} />
            </section>
          )}
        </>
      )}

      {/* ---------- Whole collection (or a non-box location): by color and type ---------- */}
      {!boxView &&
        COLOR_ORDER.filter((color) => grouped[color]).map((color) => {
          const types = grouped[color];
          const allInColor = Object.values(types).flat();
          const isCollapsed = collapsed.has(color);

          return (
            <section key={color} className={`mb-8 border-l-4 pl-4 ${COLOR_ACCENTS[color]}`}>
              <button onClick={() => toggle(color)} className="mb-2 text-xl font-semibold">
                {isCollapsed ? "▸" : "▾"} {color}{" "}
                <span className="text-sm font-normal text-gray-500">
                  ({copiesOf(allInColor)}) · {money(valueOf(allInColor))}
                </span>
              </button>

              {!isCollapsed &&
                TYPE_ORDER.filter((type) => types[type]).map((type) => (
                  <div key={type} className="mb-6">
                    <h3 className="mb-2 text-sm font-semibold text-gray-500">
                      {type} ({copiesOf(types[type])})
                    </h3>
                    <CardTiles cards={types[type]} view={view} onOpen={openCard} caption={shortLocation} />
                  </div>
                ))}
            </section>
          );
        })}

      {/* ---------- Card close-up ---------- */}
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

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-500">Location</dt>
                  <dd>{fullLocation(selected)}</dd>
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
                  <h3 className="mb-3 text-sm font-semibold text-gray-500">Manage</h3>

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
                      placeholder="Box or location name"
                      className="min-w-0 flex-1 rounded border border-gray-400 bg-transparent px-2 py-1.5 text-sm"
                    />
                    <datalist id="box-options">
                      {boxNames
                        .filter((b) => b !== selected.box)
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
                    className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
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