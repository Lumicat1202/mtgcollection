"use client";

import { useEffect, useState } from "react";

type DeckCard = { name: string; boxes: string[] };
type DeckResponse = {
  commander: { name: string; image: string | null; identity: string[] };
  strategy: string;
  categories: { name: string; cards: DeckCard[] }[];
  basic_lands: Record<string, number>;
  gaps: { role: string; suggestion: string }[];
  total: number;
  ownedInColors: number;
};

export default function DeckBuilderPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<DeckResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const visibleSuggestions = showSuggestions && query.trim().length >= 2 ? suggestions : [];

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
    setDeck(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
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
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-gray-400 bg-white text-black shadow">
            {visibleSuggestions.map((name) => (
              <li key={name}>
                <button
                  onClick={() => {
                    setQuery(name);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-gray-200"
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
          <div className="mb-6 flex flex-col gap-6 sm:flex-row">
            {deck.commander.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deck.commander.image} alt={deck.commander.name} className="w-56 rounded-xl shadow-lg" />
            )}
            <div>
              <h2 className="text-xl font-bold">{deck.commander.name}</h2>
              <p className="mb-3 text-sm text-gray-500">
                {deck.total + 1} / 100 cards · picked from {deck.ownedInColors} cards you own in these colors
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

          <div className="grid gap-6 md:grid-cols-2">
            {deck.categories.map((cat) => (
              <div key={cat.name}>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {cat.name} ({cat.cards.length})
                </h3>
                <ul className="text-sm">
                  {cat.cards.map((card) => (
                    <li key={card.name} className="flex justify-between gap-2 border-b border-gray-700/30 py-1">
                      <span>{card.name}</span>
                      <span className="text-right text-gray-500">{card.boxes.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {Object.keys(deck.basic_lands).length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Basic lands
                </h3>
                <ul className="text-sm">
                  {Object.entries(deck.basic_lands)
                    .filter(([, count]) => Number(count) > 0)
                    .map(([land, count]) => (
                      <li key={land} className="border-b border-gray-700/30 py-1">
                        {count}x {land}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

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