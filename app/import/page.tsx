"use client";

import { useState, type ChangeEvent } from "react";
import Papa from "papaparse";

type PreviewRow = {
  name: string;
  set: string;
  quantity: number;
  foil: boolean;
  scryfall_id: string;
};

export default function ImportPage() {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [box, setBox] = useState("");
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus(null);

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

  async function handleImport() {
    setImporting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          box,
          rows: rows.map(({ scryfall_id, quantity, foil }) => ({ scryfall_id, quantity, foil })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      let text = data.message;
      if (data.notFound?.length) text += ` (${data.notFound.length} couldn't be found on Scryfall)`;
      setStatus({ type: "success", text });
      setRows([]);
      setFileName("");
    } catch (err) {
      setStatus({ type: "error", text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImporting(false);
    }
  }

  const totalCopies = rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Import from ManaBox</h1>
      <p className="mb-6 text-sm text-gray-500">
        Export a CSV from ManaBox, pick it below, choose a box, and import.
      </p>

      <label className="mb-4 block text-sm">
        Box name
        <input
          value={box}
          onChange={(e) => setBox(e.target.value)}
          placeholder="e.g. Black Sorceries"
          className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
        />
      </label>

      <label className="mb-6 block text-sm">
        CSV file
        <input type="file" accept=".csv" onChange={handleFile} className="mt-1 block w-full text-sm" />
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

          <button
            onClick={handleImport}
            disabled={importing || !box.trim()}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {importing ? "Importing..." : `Import ${totalCopies} cards into ${box.trim() || "..."}`}
          </button>
          {!box.trim() && <p className="mt-2 text-sm text-gray-500">Enter a box name to import.</p>}
          <p className="mt-2 text-xs text-gray-500">
            Heads up: importing the same file twice will double the quantities.
          </p>
        </>
      )}

      {status && (
        <p className={`mt-4 text-sm ${status.type === "success" ? "text-green-500" : "text-red-500"}`}>
          {status.text}
        </p>
      )}
    </main>
  );
}