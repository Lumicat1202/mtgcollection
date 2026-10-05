"use client";

import { useEffect, useRef, useState } from "react";
import BoxPicker from "@/components/BoxPicker";
import {
  type Location,
  type PlaceableCard,
  groupOf,
  placementLabel,
  rowFor,
} from "@/lib/box-layout";

type Status = { type: "success" | "error"; text: string; where?: string };
type RecentCard = { id: number; text: string; where: string };

export default function AddCardPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [box, setBox] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [foil, setFoil] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [recent, setRecent] = useState<RecentCard[]>([]);
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

  // Where a card goes, like "Main Box · Row 2 · Black · Sorcery"
  function whereItGoes(card: PlaceableCard) {
    const boxName = box.trim();
    const location = locations.find((l) => l.name === boxName);
    return rowFor(groupOf(card), location) ? `${boxName} · ${placementLabel(card, location)}` : boxName;
  }

  async function addCard(name: string) {
    if (!name.trim() || saving || !box.trim()) return;
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

      const where = data.card ? whereItGoes(data.card) : box.trim();
      setStatus({ type: "success", text: data.message, where });
      setRecent((prev) =>
        [
          {
            id: Date.now(),
            text: `${quantity}x ${data.card?.name ?? name}${foil ? " (foil)" : ""}`,
            where,
          },
          ...prev,
        ].slice(0, 10)
      );

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
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Add Cards</h1>

      <label className="mb-4 block text-sm">
        Where is this card going?
        <BoxPicker value={box} onChange={setBox} onLocations={setLocations} />
      </label>

      <div className="mb-4 flex items-end gap-4">
        <label className="w-28 text-sm">
          Quantity
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
          />
        </label>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={foil}
            onChange={(e) => setFoil(e.target.checked)}
            className="h-4 w-4 accent-yellow-400"
          />
          Foil
        </label>
      </div>

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
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-gray-400 bg-gray-900 shadow-2xl">
            {visibleSuggestions.map((name) => (
              <li key={name}>
                <button
                  onClick={() => addCard(name)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-500/20"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!box.trim() && <p className="mt-2 text-sm text-gray-500">Choose where this card is going first.</p>}
      {saving && <p className="mt-4 text-sm text-gray-500">Adding...</p>}

      {status?.type === "success" && (
        <div className="mt-4 rounded-lg border border-green-500/40 bg-green-500/10 p-3">
          <p className="text-sm text-green-400">{status.text}</p>
          {status.where && <p className="mt-1 text-lg font-semibold">📍 {status.where}</p>}
        </div>
      )}
      {status?.type === "error" && <p className="mt-4 text-sm text-red-500">{status.text}</p>}

      {recent.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Recently added</h2>
          <ul className="text-sm">
            {recent.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 border-b border-gray-700/30 py-1.5">
                <span>{item.text}</span>
                <span className="text-right text-gray-500">{item.where}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}