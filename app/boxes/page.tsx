"use client";

import { useEffect, useMemo, useState } from "react";
import BoxEditor, { type LocationDraft, SUGGESTED_ROWS } from "@/components/BoxEditor";
import { type Card, money, priceOf } from "@/components/CardTiles";
import { GROUP_LABELS, type Location } from "@/lib/box-layout";

type Editing = { mode: "new"; draft: LocationDraft } | { mode: "edit"; location: Location };
type Stats = { copies: number; value: number };

async function fetchAll(): Promise<{ cards: Card[]; locations: Location[] }> {
  const [cardsRes, locationsRes] = await Promise.all([fetch("/api/cards"), fetch("/api/locations")]);
  const cardsData = await cardsRes.json();
  const locationsData = await locationsRes.json();
  if (cardsData.error) throw new Error(cardsData.error);
  if (locationsData.error) throw new Error(locationsData.error);
  return { cards: cardsData.cards, locations: locationsData.locations };
}

export default function BoxesPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  useEffect(() => {
    fetchAll()
      .then((data) => {
        setCards(data.cards);
        setLocations(data.locations);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const data = await fetchAll();
    setCards(data.cards);
    setLocations(data.locations);
  }

  // Card count and value for each spot
  const stats = useMemo(() => {
    const map = new Map<string, Stats>();
    for (const card of cards) {
      const s = map.get(card.box) ?? { copies: 0, value: 0 };
      s.copies += card.quantity;
      s.value += priceOf(card) * card.quantity;
      map.set(card.box, s);
    }
    return map;
  }, [cards]);

  // Spots your cards use that aren't set up on this page yet
  const untracked = useMemo(
    () => Array.from(stats.keys()).filter((name) => !locations.some((l) => l.name === name)).sort(),
    [stats, locations]
  );

  async function saveDraft(draft: LocationDraft) {
    const body = JSON.stringify({
      name: draft.name,
      kind: draft.kind,
      rows: draft.rows.map((groups) => ({ groups })),
    });

    const res =
      editing?.mode === "edit"
        ? await fetch(`/api/locations/${editing.location.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch("/api/locations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");

    await refresh();
    setNotice({ type: "success", text: editing?.mode === "edit" ? `Saved ${data.location.name}` : `Created ${data.location.name}` });
    setEditing(null);
  }

  async function saveAsSimpleSpot(name: string) {
    setNotice(null);
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind: "other", rows: [] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice({ type: "error", text: data.error || "Save failed" });
      return;
    }
    await refresh();
    setNotice({ type: "success", text: `Saved ${name}` });
  }

  async function deleteLocation(location: Location) {
    if (!confirm(`Delete ${location.name}?`)) return;
    setNotice(null);
    const res = await fetch(`/api/locations/${location.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setNotice({ type: "error", text: data.error || "Delete failed" });
      return;
    }
    await refresh();
    setNotice({ type: "success", text: `Deleted ${location.name}` });
  }

  if (loading) return <p className="p-6">Loading your boxes...</p>;
  if (error) return <p className="p-6 text-red-500">Error: {error}</p>;

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Boxes</h1>
      <p className="mb-6 text-sm text-gray-500">
        Set up how each box is organized. The app uses these rows to tell you where every card goes.
      </p>

      {notice && (
        <p className={`mb-4 text-sm ${notice.type === "success" ? "text-green-400" : "text-red-500"}`}>
          {notice.text}
        </p>
      )}

      {editing ? (
        <BoxEditor
          key={editing.mode === "edit" ? editing.location.id : `new-${editing.draft.kind}-${editing.draft.name}`}
          initial={
            editing.mode === "new"
              ? editing.draft
              : {
                  name: editing.location.name,
                  kind: editing.location.kind,
                  rows: editing.location.rows.map((r) => [...r.groups]),
                }
          }
          isNew={editing.mode === "new"}
          boxes={locations.filter((l) => l.kind === "box")}
          onSave={saveDraft}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="mb-8 flex flex-wrap gap-3">
          <button
            onClick={() => {
              setNotice(null);
              setEditing({ mode: "new", draft: { name: "", kind: "box", rows: SUGGESTED_ROWS } });
            }}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white"
          >
            + New box
          </button>
          <button
            onClick={() => {
              setNotice(null);
              setEditing({ mode: "new", draft: { name: "", kind: "other", rows: [] } });
            }}
            className="rounded border border-gray-400 px-4 py-2 hover:bg-gray-500/10"
          >
            + New deck, binder, or other spot
          </button>
        </div>
      )}

      {locations.length === 0 && !editing && (
        <p className="mb-6 rounded bg-gray-500/10 p-4 text-sm">
          You don&apos;t have any boxes set up yet. Create one to tell the app how your cards are organized, and it
          will show you where every card goes.
        </p>
      )}

      <ul className="space-y-4">
        {locations.map((location) => {
          const s = stats.get(location.name);
          return (
            <li key={location.id} className="rounded-lg border border-gray-400/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{location.name}</h2>
                  <p className="text-sm text-gray-500">
                    {location.kind === "box"
                      ? `Box with ${location.rows.length} row${location.rows.length === 1 ? "" : "s"}`
                      : "Deck, binder, or other spot"}
                    {" · "}
                    {s ? `${s.copies} cards, ${money(s.value)}` : "Empty"}
                  </p>
                </div>
                {!editing && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setNotice(null);
                        setEditing({ mode: "edit", location });
                      }}
                      className="rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteLocation(location)}
                      className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {location.kind === "box" && (
                <ol className="mt-3 space-y-1 text-sm">
                  {location.rows.map((row, i) => (
                    <li key={i}>
                      <span className="text-gray-500">Row {i + 1}:</span>{" "}
                      {row.groups.length ? row.groups.map((g) => GROUP_LABELS[g]).join(", ") : "Empty"}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>

      {untracked.length > 0 && !editing && (
        <section className="mt-10">
          <h2 className="mb-1 text-lg font-semibold">Other spots your cards are in</h2>
          <p className="mb-3 text-sm text-gray-500">
            These names come from cards you&apos;ve added or moved, but they aren&apos;t set up here yet.
          </p>
          <ul className="space-y-2">
            {untracked.map((name) => (
              <li
                key={name}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-400/40 p-3"
              >
                <span>
                  {name} <span className="text-sm text-gray-500">({stats.get(name)?.copies ?? 0} cards)</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setNotice(null);
                      setEditing({ mode: "new", draft: { name, kind: "box", rows: SUGGESTED_ROWS } });
                    }}
                    className="rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
                  >
                    Set up rows
                  </button>
                  <button
                    onClick={() => saveAsSimpleSpot(name)}
                    className="rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
                  >
                    Save as deck or binder
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}