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

// What a valid Scryfall ID looks like
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const keyOf = (r: PreviewRow) => `${r.scryfall_id.toLowerCase()}|${r.foil}`;
const copiesOf = (list: PreviewRow[]) => list.reduce((sum, r) => sum + r.quantity, 0);

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
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [valuable, setValuable] = useState<ValuableCard[] | null>(null);
  const [threshold, setThreshold] = useState(5);
  const [missing, setMissing] = useState<PreviewRow[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
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
    setMissing(null);
    setFileKey((k) => k + 1);
  }

  // Reads a ManaBox CSV. Some files use curly quotes or extra spaces around names
  // with commas (like "Baxter, Fly in the Ointment"), which splits the name in two,
  // so those get cleaned up first.
  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus(null);
    setValuable(null);
    setMissing(null);
    setSkipped([]);

    try {
      const text = (await file.text())
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/(^|,)[ \t]+"/gm, '$1"');

      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      const parsed = result.data
        .map((r) => {
          // Use the Scryfall ID column, or find an ID anywhere in the row if columns got shifted
          const fromColumn = String(r["Scryfall ID"] ?? "").trim();
          const anywhere = Object.values(r)
            .flat()
            .map((v) => String(v ?? "").trim())
            .find((v) => SCRYFALL_ID.test(v));
          return {
            name: String(r["Name"] ?? "").trim(),
            set: String(r["Set code"] ?? "").trim(),
            quantity: Number(r["Quantity"]) || 1,
            foil: r["Foil"] === "foil" || r["Foil"] === "etched",
            scryfall_id: SCRYFALL_ID.test(fromColumn) ? fromColumn : anywhere ?? "",
          };
        })
        .filter((r) => r.scryfall_id);

      if (parsed.length === 0) {
        setStatus({ type: "error", text: "Couldn't find any cards. Is this a ManaBox CSV export?" });
      }
      setRows(parsed);
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : "Couldn't read that file" });
    }
  }

  function requestBody(list: PreviewRow[]) {
    return JSON.stringify({
      box,
      rows: list.map(({ scryfall_id, quantity, foil }) => ({ scryfall_id, quantity, foil })),
    });
  }

  // Import the whole file, or just a list (like only the missing cards)
  async function handleImport(list: PreviewRow[] = rows) {
    setImporting(true);
    setStatus(null);
    setValuable(null);
    setSkipped([]);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody(list),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      // Name any cards that were skipped, so they're easy to spot
      const notFound = new Set(((data.notFound ?? []) as string[]).map((id) => id.toLowerCase()));
      setSkipped(
        list
          .filter((r) => notFound.has(r.scryfall_id.toLowerCase()))
          .map((r) => `${r.quantity}x ${r.name || r.scryfall_id}`)
      );

      setStatus({ type: "success", text: data.message });
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

  // Compare the file to the box and list cards that aren't there
  async function handleCheck() {
    setChecking(true);
    setStatus(null);
    setValuable(null);
    setSkipped([]);
    setMissing(null);
    try {
      const res = await fetch("/api/import/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody(rows),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");

      const missingKeys = new Set(
        ((data.missing ?? []) as { scryfall_id: string; foil: boolean }[]).map((m) => `${m.scryfall_id}|${m.foil}`)
      );
      setMissing(rows.filter((r) => missingKeys.has(keyOf(r))));
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : "Check failed" });
    } finally {
      setChecking(false);
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        `Remove the ${copiesOf(rows)} cards in ${fileName} from ${box.trim()}? Use this to undo an import. Copies you had before stay.`
      )
    ) {
      return;
    }
    setRemoving(true);
    setStatus(null);
    setValuable(null);
    setSkipped([]);
    try {
      const res = await fetch("/api/import/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody(rows),
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

  const guideLocation = guide ? locations.find((l) => l.name === guide.boxName) ?? null : null;
  const working = importing || removing || checking;
  const boxName = box.trim();

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
            <strong>{fileName}</strong>: {rows.length} different cards, {copiesOf(rows)} total copies
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
              onClick={() => handleImport()}
              disabled={working || !boxName}
              className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {importing ? "Importing..." : `Import ${copiesOf(rows)} cards into ${boxName || "..."}`}
            </button>
            <button
              onClick={handleCheck}
              disabled={working || !boxName}
              className="rounded border border-gray-400 px-4 py-2 text-sm hover:bg-gray-500/10 disabled:opacity-50"
            >
              {checking ? "Checking..." : "🔍 Check what's missing"}
            </button>
            <button
              onClick={handleRemove}
              disabled={working || !boxName}
              className="rounded border border-red-500 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              {removing ? "Removing..." : "Undo an import: remove these cards"}
            </button>
          </div>
          {!boxName && <p className="mt-2 text-sm text-gray-500">Choose where these cards are going.</p>}
          <p className="mt-2 text-xs text-gray-500">
            Already imported this file before? Use Check what&apos;s missing to add only the cards that didn&apos;t
            make it, instead of importing everything again.
          </p>
        </>
      )}

      {status && (
        <p className={`mt-4 text-sm ${status.type === "success" ? "text-green-500" : "text-red-500"}`}>
          {status.text}
        </p>
      )}

      {/* Missing cards from a check */}
      {missing && missing.length === 0 && (
        <p className="mt-4 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-400">
          Everything in this file is already in {boxName}. Nothing&apos;s missing!
        </p>
      )}

      {missing && missing.length > 0 && (
        <div className="mt-6 rounded-lg border-2 border-amber-400 bg-amber-400/10 p-4">
          <h2 className="mb-1 text-lg font-bold">
            {missing.length} card{missing.length === 1 ? "" : "s"} from this file aren&apos;t in {boxName}
          </h2>
          <p className="mb-3 text-sm text-gray-500">
            These never made it into your collection. Cards that are already in {boxName} won&apos;t be touched.
          </p>
          <ul className="mb-4 max-h-60 overflow-y-auto text-sm">
            {missing.map((r, i) => (
              <li key={`${keyOf(r)}-${i}`} className="border-b border-gray-700/30 py-1">
                <span className="text-gray-500">{r.quantity}x</span> {r.name}
                {r.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
              </li>
            ))}
          </ul>
          <button
            onClick={() => handleImport(missing)}
            disabled={working}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {importing ? "Importing..." : `Import only these ${copiesOf(missing)} cards`}
          </button>
        </div>
      )}

      {/* Skipped cards warning */}
      {skipped.length > 0 && (
        <div className="mt-6 rounded-lg border-2 border-amber-400 bg-amber-400/10 p-4">
          <h2 className="mb-1 text-lg font-bold">⚠️ {skipped.length} cards were skipped</h2>
          <p className="mb-3 text-sm text-gray-500">
            Scryfall couldn&apos;t find these, so they weren&apos;t added. You can add them one at a time on the Add
            page.
          </p>
          <ul className="max-h-60 overflow-y-auto text-sm">
            {skipped.map((name, i) => (
              <li key={`${name}-${i}`} className="border-b border-gray-700/30 py-1">
                {name}
              </li>
            ))}
          </ul>
        </div>
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