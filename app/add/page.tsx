"use client";

import { useEffect, useRef, useState } from "react";

export default function AddCardPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [box, setBox] = useState("Box 1");
  const [quantity, setQuantity] = useState(1);
  const [foil, setFoil] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only show suggestions once at least 2 letters are typed
  const visibleSuggestions = query.trim().length >= 2 ? suggestions : [];

  // Ask Scryfall for name suggestions shortly after you stop typing
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

  async function addCard(name: string) {
    if (!name.trim() || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, box, quantity, foil }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setStatus({ type: "success", text: data.message });
      setQuery("");
      setSuggestions([]);
      setQuantity(1);
      setFoil(false);
    } catch (err) {
      setStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Add Cards</h1>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <label className="col-span-2 text-sm">
          Box
          <input
            value={box}
            onChange={(e) => setBox(e.target.value)}
            className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Quantity
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
          />
        </label>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
        Foil
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCard(visibleSuggestions[0] ?? query);
          }}
          placeholder="Start typing a card name..."
          autoFocus
          className="w-full rounded border border-gray-400 bg-transparent px-3 py-2 text-lg"
        />

        {visibleSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-gray-400 bg-white text-black shadow">
            {visibleSuggestions.map((name) => (
              <li key={name}>
                <button
                  onClick={() => addCard(name)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-200"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {saving && <p className="mt-4 text-sm text-gray-500">Adding...</p>}
      {status && (
        <p className={`mt-4 text-sm ${status.type === "success" ? "text-green-500" : "text-red-500"}`}>
          {status.text}
        </p>
      )}
    </main>
  );
}