"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Papa from "papaparse";
import BoxPicker from "@/components/BoxPicker";
import SortingGuide, { type GuideCard } from "@/components/SortingGuide";
import type { Location } from "@/lib/box-layout";

type PreviewRow = {
  name: string;
  set: string;
  quantity: number;
  foil: boolean;
  scryfall_id: string;
};

type ValuableCard = {
  name: string;
  price: number;
  foil: boolean;
  quantity: number;
  image: string | null;
};

type Guide = {
  boxName: string;
  cards: GuideCard[];
  checked: string[];
  createdAt: string;
};

// The latest sorting guide is saved on this device so you can file later
const GUIDE_KEY = "mtg-sorting-guide";

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function saveGuide(guide: Guide | null) {
  try {
    if (guide) localStorage.setItem(GUIDE_KEY, JSON.stringify(guide));
    else localStorage.removeItem(GUIDE_KEY);
  } catch {
    // Storage can be unavailable (like some private windows); the guide still works until you leave
  }
}

export default function ImportPage() {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [box, setBox] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [valuable, setValuable] = useState<ValuableCard[] | null>(null);
  const [threshold, setThreshold] = useState(5);
  const [guide, setGuide] = useState<Guide | null>(null);

  // Bring back the last sorting guide, if there is one
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GUIDE_KEY);
      if (saved) setGuide(JSON.parse(saved));
    } catch {
      // Ignore a broken or missing saved guide
    }
  }, []);

  function updateGuide(change: (g: Guide) => Guide) {
    setGuide((prev) => {
      if (!prev) return prev;
      const next = change(prev);
      saveGuide(next);
      return next;
    });
  }

  function toggleChecked(key: string) {
    updateGuide((g) => ({
      ...g,
      checked: g.checked.includes(key) ? g.checked.filter((k) => k !== key) : [...g.checked, key],
    }));
  }

  function setManyChecked(keys: string[], done: boolean) {
    updateGuide((g) => ({
      ...g,
      checked: done
        ? Array.from(new Set([...g.checked, ...keys]))
        : g.checked.filter((k) => !keys.includes(k)),
    }));
  }

  function clearGuide() {
    setGuide(null);
    saveGuide(null);
  }

  // Clear the chosen file so the same file can be picked again
  function resetFile() {
    setRows([]);
    setFileName("");
    setFileKey((k) => k + 1);
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus(null);
    setValuable(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed = result.data
          .filter((r) => r["Scryfall ID"])
          .map((r) => ({
            name: r["Name"],
            set: r["Set code"],
            quantity: Number(r["Quantity"]) || 1,
            foil: r["Foil"] === "foil" || r["Foil"] === "etched",
            scryfall_id: r["Scryfall ID"],
          }));
        if (parsed.length === 0) {
          setStatus({ type: "error", text: "Couldn't find any cards. Is this a ManaBox CSV export?" });
        }
        setRows(parsed);
      },
      error: (err) => setStatus({ type: "error", text: err.message }),
    });
  }

  function requestBody() {
    return JSON.stringify({
      box,
      rows: rows.map(({ scryfall_id, quantity, foil }) => ({ scryfall_id, quantity, foil })),
    });
  }

  async function handleImport() {
    setImporting(true);
    setStatus(null);
    setValuable(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      let text = data.message;
      if (data.notFound?.length) text += ` (${data.notFound.length} couldn't be found on Scryfall)`;
      setStatus({ type: "success", text });
      setValuable(data.valuable ?? []);
      setThreshold(data.valuableThreshold ?? 5);

      const newGuide: Guide = {
        boxName: box.trim(),
        cards: data.imported ?? [],
        checked: [],
        createdAt: new Date().toISOString(),
      };
      setGuide(newGuide);
      saveGuide(newGuide);
      resetFile();
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove() {
    const copies = rows.reduce((sum, r) => sum + r.quantity, 0);
    if (
      !confirm(
        `Remove the ${copies} cards in ${fileName} from ${box.trim()}? Use this to undo an import. Copies you had before stay.`
      )
    ) {
      return;
    }
    setRemoving(true);
    setStatus(null);
    setValuable(null);
    try {
      const res = await fetch("/api/import/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setStatus({ type: "success", text: data.message });
      resetFile();
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : "Remove failed" });
    } finally {
      setRemoving(false);
    }
  }

  const totalCopies = rows.reduce((sum, r) => sum + r.quantity, 0);
  const guideLocation = guide ? locations.find((l) => l.name === guide.boxName) ?? null : null;
  const working = importing || removing;

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Import from ManaBox</h1>
      <p className="mb-6 text-sm text-gray-500">
        Export a CSV from ManaBox, choose where the cards are going, and import.
      </p>

      <label className="mb-4 block text-sm">
        Where are these cards going?
        <BoxPicker value={box} onChange={setBox} onLocations={setLocations} />
      </label>

      <label className="mb-6 block text-sm">
        CSV file
        <input
          key={fileKey}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="mt-1 block w-full text-sm"
        />
      </label>

      {rows.length > 0 && (
        <>
          <p className="mb-2 text-sm">
            <strong>{fileName}</strong>: {rows.length} different cards, {totalCopies} total copies
          </p>

          <div className="mb-4 max-h-80 overflow-y-auto rounded border border-gray-400">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.scryfall_id}-${r.foil}-${i}`} className="border-b border-gray-700/30">
                    <td className="w-10 px-2 py-1">{r.quantity}x</td>
                    <td className="py-1">
                      {r.name}
                      {r.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
                    </td>
                    <td className="w-16 px-2 py-1 uppercase text-gray-500">{r.set}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleImport}
              disabled={working || !box.trim()}
              className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {importing ? "Importing..." : `Import ${totalCopies} cards into ${box.trim() || "..."}`}
            </button>
            <button
              onClick={handleRemove}
              disabled={working || !box.trim()}
              className="rounded border border-red-500 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              {removing ? "Removing..." : "Undo an import: remove these cards"}
            </button>
          </div>
          {!box.trim() && <p className="mt-2 text-sm text-gray-500">Choose where these cards are going.</p>}
          <p className="mt-2 text-xs text-gray-500">
            Importing the same file twice doubles the quantities. If that happens, pick the same file again and use
            the remove button to undo one of them.
          </p>
        </>
      )}

      {status && (
        <p className={`mt-4 text-sm ${status.type === "success" ? "text-green-500" : "text-red-500"}`}>
          {status.text}
        </p>
      )}

      {/* Valuable cards alert */}
      {valuable && valuable.length > 0 && (
        <div className="mt-6 rounded-lg border-2 border-yellow-400 bg-yellow-400/10 p-4">
          <h2 className="mb-1 text-lg font-bold">💰 Valuable cards found!</h2>
          <p className="mb-3 text-sm text-gray-500">
            {valuable.length} card{valuable.length === 1 ? "" : "s"} worth {money(threshold)} or more in this
            batch. You may want to pull these out and sleeve them before filing the rest.
          </p>
          <ul className="space-y-2">
            {valuable.map((card, i) => (
              <li key={`${card.name}-${card.foil}-${i}`} className="flex items-center gap-3">
                {card.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.image} alt={card.name} className="w-12 rounded" />
                )}
                <span className="flex-1">
                  {card.quantity > 1 && <span className="text-gray-500">{card.quantity}x </span>}
                  {card.name}
                  {card.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
                </span>
                <span className="font-bold text-green-500">{money(card.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {valuable && valuable.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No cards worth {money(threshold)} or more in this batch.</p>
      )}

      {/* Sorting guide */}
      {guide && (
        <SortingGuide
          boxName={guide.boxName}
          location={guideLocation}
          cards={guide.cards}
          checked={guide.checked}
          valuableThreshold={threshold}
          onToggle={toggleChecked}
          onSetMany={setManyChecked}
          onClear={clearGuide}
        />
      )}
    </main>
  );
}