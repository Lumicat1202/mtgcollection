"use client";

import { useEffect, useMemo, useState } from "react";
import SortingGuide, { type GuideCard } from "@/components/SortingGuide";
import type { Location } from "@/lib/box-layout";

type DeckCard = {
  name: string;
  box: string;
  spots: string[];
  colors: string[];
  type_line: string | null;
  mana_value: number | null;
};

type DeckResponse = {
  commander: { name: string; image: string | null; identity: string[] };
  strategy: string;
  categories: { name: string; cards: DeckCard[] }[];
  basic_lands: Record<string, number>;
  gaps: { role: string; suggestion: string }[];
  total: number;
  ownedInColors: number;
};

type SavedDeck = { deck: DeckResponse; pulled: string[] };

// The last deck you built is saved on this device
const SAVED_KEY = "mtg-last-deck";

function saveDeck(saved: SavedDeck | null) {
  try {
    if (saved) localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    // Storage can be unavailable (like some private windows)
  }
}

export default function DeckBuilderPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<DeckResponse | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [view, setView] = useState<"roles" | "pull">("roles");
  const [pulled, setPulled] = useState<string[]>([]);

  const visibleSuggestions = showSuggestions && query.trim().length >= 2 ? suggestions : [];

  // Load your boxes, plus the last deck you built
  useEffect(() => {
    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => setLocations(data.locations ?? []))
      .catch(() => {});

    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedDeck;
        if (saved.deck?.categories?.[0]?.cards?.[0]?.spots) {
          setDeck(saved.deck);
          setPulled(saved.pulled ?? []);
          setFromSaved(true);
        }
      }
    } catch {
      // Ignore a broken saved deck
    }
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        setSuggestions(data.data ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function buildDeck() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    try {
      const res = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commander: query, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setDeck(data);
      setPulled([]);
      setView("roles");
      setFromSaved(false);
      saveDeck({ deck: data, pulled: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function updatePulled(next: string[]) {
    setPulled(next);
    if (deck) saveDeck({ deck, pulled: next });
  }

  function togglePulled(key: string) {
    updatePulled(pulled.includes(key) ? pulled.filter((k) => k !== key) : [...pulled, key]);
  }

  function setManyPulled(keys: string[], done: boolean) {
    updatePulled(done ? Array.from(new Set([...pulled, ...keys])) : pulled.filter((k) => !keys.includes(k)));
  }

  function copyDecklist() {
    if (!deck) return;
    const lines = [`1 ${deck.commander.name}`];
    for (const cat of deck.categories) for (const card of cat.cards) lines.push(`1 ${card.name}`);
    for (const [land, count] of Object.entries(deck.basic_lands)) {
      if (Number(count) > 0) lines.push(`${count} ${land}`);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Pull list: deck cards grouped by the box they live in
  const pullGroups = useMemo(() => {
    if (!deck) return [];
    const byBox = new Map<string, GuideCard[]>();
    for (const cat of deck.categories) {
      for (const card of cat.cards) {
        const list = byBox.get(card.box) ?? [];
        list.push({
          key: card.name,
          name: card.name,
          colors: card.colors,
          type_line: card.type_line,
          mana_value: card.mana_value,
          quantity: 1,
          foil: false,
          price: 0,
        });
        byBox.set(card.box, list);
      }
    }
    return Array.from(byBox.entries()).map(([box, cards]) => ({
      box,
      cards,
      location: locations.find((l) => l.name === box) ?? null,
    }));
  }, [deck, locations]);

  const basicLandList = deck
    ? Object.entries(deck.basic_lands).filter(([, count]) => Number(count) > 0)
    : [];

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Deck Builder</h1>
      <p className="mb-6 text-sm text-gray-500">
        Pick a commander and Claude will build a deck from cards you own.
      </p>

      <div className="relative mb-4">
        <label className="text-sm">
          Commander
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            placeholder="Start typing a commander's name..."
            className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2 text-lg"
          />
        </label>
        {visibleSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-gray-400 bg-gray-900 shadow-2xl">
            {visibleSuggestions.map((name) => (
              <li key={name}>
                <button
                  onClick={() => {
                    setQuery(name);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-gray-500/20"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="mb-4 block text-sm">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder='e.g. "Bracket 3, not too strong" or "focus on tokens and sacrifice"'
          rows={2}
          className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
        />
      </label>

      <button
        onClick={buildDeck}
        disabled={loading || !query.trim()}
        className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Building..." : "Build deck"}
      </button>

      {loading && (
        <p className="mt-4 text-sm text-gray-500">
          Looking through your collection. This can take a minute or two.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {deck && (
        <section className="mt-8">
          {fromSaved && (
            <p className="mb-4 text-sm text-gray-500">
              This is the last deck you built. It stays here until you build a new one.
            </p>
          )}

          <div className="mb-6 flex flex-col gap-6 sm:flex-row">
            {deck.commander.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deck.commander.image} alt={deck.commander.name} className="w-56 self-start rounded-xl shadow-lg" />
            )}
            <div>
              <h2 className="text-xl font-bold">{deck.commander.name}</h2>
              <p className="mb-3 text-sm text-gray-500">
                {deck.total + 1} / 100 cards, picked from {deck.ownedInColors} cards you own in these colors
              </p>
              <p className="mb-4">{deck.strategy}</p>
              <button
                onClick={copyDecklist}
                className="rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
              >
                {copied ? "Copied!" : "📋 Copy decklist"}
              </button>
            </div>
          </div>

          {/* View switch */}
          <div className="mb-6 inline-flex overflow-hidden rounded border border-gray-400">
            <button
              onClick={() => setView("roles")}
              className={`px-4 py-2 text-sm ${view === "roles" ? "bg-blue-600 text-white" : "hover:bg-gray-500/10"}`}
            >
              By role
            </button>
            <button
              onClick={() => setView("pull")}
              className={`px-4 py-2 text-sm ${view === "pull" ? "bg-blue-600 text-white" : "hover:bg-gray-500/10"}`}
            >
              📦 Pull list
            </button>
          </div>

          {view === "roles" ? (
            <div className="grid gap-6 md:grid-cols-2">
              {deck.categories.map((cat) => (
                <div key={cat.name}>
                  <h3 className="mb-1 text-sm font-semibold text-gray-500">
                    {cat.name} ({cat.cards.length})
                  </h3>
                  <ul className="text-sm">
                    {cat.cards.map((card) => (
                      <li key={card.name} className="border-b border-gray-700/30 py-1.5">
                        <span className="block">{card.name}</span>
                        <span className="block text-xs text-gray-500">{card.spots.join(" / ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {basicLandList.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-gray-500">Basic lands</h3>
                  <ul className="text-sm">
                    {basicLandList.map(([land, count]) => (
                      <li key={land} className="border-b border-gray-700/30 py-1.5">
                        {count}x {land}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Your deck in the same order as your box. Work through it front to back and check cards off as you
                pull them.
              </p>
              {basicLandList.length > 0 && (
                <p className="mt-3 text-sm">
                  Plus basic lands:{" "}
                  {basicLandList.map(([land, count]) => `${count} ${land}`).join(", ")}
                </p>
              )}
              {pullGroups.map((group) => (
                <SortingGuide
                  key={group.box}
                  mode="pull"
                  boxName={group.box}
                  location={group.location}
                  cards={group.cards}
                  checked={pulled}
                  valuableThreshold={Infinity}
                  onToggle={togglePulled}
                  onSetMany={setManyPulled}
                  onClear={() => updatePulled([])}
                />
              ))}
            </>
          )}

          {deck.gaps.length > 0 && (
            <div className="mt-8 rounded border border-amber-400/50 p-4">
              <h3 className="mb-2 font-semibold">🛒 Where your collection is thin</h3>
              <ul className="space-y-2 text-sm">
                {deck.gaps.map((gap) => (
                  <li key={gap.role}>
                    <strong>{gap.role}:</strong> {gap.suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}