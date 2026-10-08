"use client";

import { useMemo } from "react";
import { type Location, type PlaceableCard, buildBoxView } from "@/lib/box-layout";

export type GuideCard = PlaceableCard & {
  key: string;
  quantity: number;
  foil: boolean;
  price: number;
};

type Props = {
  boxName: string;
  location: Location | null;
  cards: GuideCard[];
  checked: string[];
  valuableThreshold: number;
  onToggle: (key: string) => void;
  onSetMany: (keys: string[], done: boolean) => void;
  onClear: () => void;
  // "file" = putting new cards away, "pull" = taking deck cards out
  mode?: "file" | "pull";
};

const WORDS = {
  file: {
    title: "Sorting guide",
    progress: "filed",
    markAll: "Mark all filed",
    done: "All filed! 🎉",
    clear: "Clear guide",
  },
  pull: {
    title: "Pull list",
    progress: "pulled",
    markAll: "Mark all pulled",
    done: "All pulled! Time to sleeve up. 🎉",
    clear: "Reset checkmarks",
  },
};

// Lists cards in the exact order of your box, with checkboxes
export default function SortingGuide({
  boxName,
  location,
  cards,
  checked,
  valuableThreshold,
  onToggle,
  onSetMany,
  onClear,
  mode = "file",
}: Props) {
  const words = WORDS[mode];
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const view = useMemo(
    () => (location?.kind === "box" ? buildBoxView(cards, location) : null),
    [cards, location]
  );

  const totalCopies = cards.reduce((sum, c) => sum + c.quantity, 0);
  const doneCopies = cards.filter((c) => checkedSet.has(c.key)).reduce((sum, c) => sum + c.quantity, 0);
  const percent = totalCopies ? Math.round((doneCopies / totalCopies) * 100) : 0;

  function renderCard(card: GuideCard) {
    const done = checkedSet.has(card.key);
    return (
      <li key={card.key}>
        <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1 hover:bg-gray-500/10">
          <input
            type="checkbox"
            checked={done}
            onChange={() => onToggle(card.key)}
            className="h-4 w-4 shrink-0 accent-yellow-400"
          />
          <span className={`flex-1 ${done ? "text-gray-500 line-through" : ""}`}>
            <span className="text-gray-500">{card.quantity}x</span> {card.name}
            {card.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
            {card.price >= valuableThreshold && (
              <span className="ml-2 rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-extrabold text-black no-underline">
                $$
              </span>
            )}
          </span>
        </label>
      </li>
    );
  }

  function renderSection(title: string, list: GuideCard[], key: string) {
    const keys = list.map((c) => c.key);
    const allDone = keys.every((k) => checkedSet.has(k));
    return (
      <div key={key} className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          {title ? <h4 className="text-sm font-semibold text-gray-500">{title}</h4> : <span />}
          <button onClick={() => onSetMany(keys, !allDone)} className="text-xs text-blue-400 hover:underline">
            {allDone ? "Undo" : words.markAll}
          </button>
        </div>
        <ul>{list.map(renderCard)}</ul>
      </div>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-gray-400/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {words.title}: {boxName}
          </h2>
          <p className="text-sm text-gray-500">
            {doneCopies} of {totalCopies} cards {words.progress}
          </p>
        </div>
        <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-300">
          {words.clear}
        </button>
      </div>

      <div className="mb-6 h-2 overflow-hidden rounded-full bg-gray-700">
        <div className="h-full bg-yellow-400 transition-all" style={{ width: `${percent}%` }} />
      </div>

      {view ? (
        <>
          {view.rows.map((row) =>
            row.groups.length === 0 ? null : (
              <div key={row.row} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">Row {row.row}</h3>
                {row.groups.map((g) => (
                  <div key={g.group} className="mb-3 border-l-2 border-gray-400 pl-3">
                    <p className="mb-1 font-semibold">{g.title}</p>
                    {g.sections.map((s) => renderSection(s.title, s.cards, `${g.group}-${s.title}`))}
                  </div>
                ))}
              </div>
            )
          )}
          {view.unplaced.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-lg font-semibold">Not assigned to a row</h3>
              {renderSection("", view.unplaced, "unplaced")}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-500">
            {boxName} doesn&apos;t have rows, so here&apos;s everything in alphabetical order.
          </p>
          {renderSection("", [...cards].sort((a, b) => a.name.localeCompare(b.name)), "all")}
        </>
      )}

      {totalCopies > 0 && percent === 100 && <p className="mt-2 font-semibold text-green-500">{words.done}</p>}
    </section>
  );
}