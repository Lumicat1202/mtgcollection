"use client";

import { useState } from "react";
import { GROUP_LABELS, type GroupCode, type Location } from "@/lib/box-layout";

export type LocationDraft = {
  name: string;
  kind: "box" | "other";
  rows: GroupCode[][];
};

export const ALL_GROUPS = Object.keys(GROUP_LABELS) as GroupCode[];

// Starting layout for a brand-new box
export const SUGGESTED_ROWS: GroupCode[][] = [
  ["W", "U"],
  ["B", "R"],
  ["G", "C"],
  ["BASIC", "LANDS", "TOKENS", "MULTI"],
];

type Props = {
  initial: LocationDraft;
  isNew: boolean;
  boxes: Location[];
  onSave: (draft: LocationDraft) => Promise<void>;
  onCancel: () => void;
};

export default function BoxEditor({ initial, isNew, boxes, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState(initial.kind);
  const [rows, setRows] = useState<GroupCode[][]>(initial.rows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = new Set(rows.flat());
  const unassigned = ALL_GROUPS.filter((g) => !used.has(g));

  function updateRow(index: number, groups: GroupCode[]) {
    setRows((prev) => prev.map((row, i) => (i === index ? groups : row)));
  }

  function moveGroup(rowIndex: number, groupIndex: number, direction: -1 | 1) {
    const row = [...rows[rowIndex]];
    const target = groupIndex + direction;
    if (target < 0 || target >= row.length) return;
    [row[groupIndex], row[target]] = [row[target], row[groupIndex]];
    updateRow(rowIndex, row);
  }

  function moveRow(index: number, direction: -1 | 1) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, kind, rows });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const smallButton =
    "rounded px-1.5 text-gray-500 hover:bg-gray-500/20 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <section className="mb-8 rounded-lg border border-yellow-400/40 p-4">
      <h2 className="mb-4 text-xl font-bold">
        {isNew ? (kind === "box" ? "New box" : "New spot") : `Edit ${initial.name}`}
      </h2>

      <label className="mb-4 block text-sm">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "box" ? "e.g. Box 2" : "e.g. Jodah deck or Trade binder"}
          className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
        />
      </label>

      <fieldset className="mb-5">
        <legend className="mb-2 text-sm">What is it?</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={kind === "box"}
              onChange={() => setKind("box")}
              className="accent-yellow-400"
            />
            A box with rows
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={kind === "other"}
              onChange={() => setKind("other")}
              className="accent-yellow-400"
            />
            A deck, binder, or other spot (no rows)
          </label>
        </div>
      </fieldset>

      {kind === "box" && (
        <>
          {isNew && (
            <label className="mb-4 block text-sm">
              Start from
              <select
                onChange={(e) => {
                  const source = boxes.find((b) => b.id === e.target.value);
                  setRows(source ? source.rows.map((r) => [...r.groups]) : SUGGESTED_ROWS);
                }}
                className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
              >
                <option value="" className="text-black">Suggested layout</option>
                {boxes.map((b) => (
                  <option key={b.id} value={b.id} className="text-black">
                    Copy {b.name}&apos;s layout
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="mb-3 text-sm text-gray-500">
            Groups in each row are filed left to right. Inside each group, cards are sorted by spell type and mana
            value.
          </p>

          <ol className="mb-4 space-y-3">
            {rows.map((row, rowIndex) => (
              <li key={rowIndex} className="rounded border border-gray-400/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">Row {rowIndex + 1}</span>
                  <div className="flex items-center gap-1 text-sm">
                    <button
                      onClick={() => moveRow(rowIndex, -1)}
                      disabled={rowIndex === 0}
                      aria-label={`Move row ${rowIndex + 1} up`}
                      className={smallButton}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveRow(rowIndex, 1)}
                      disabled={rowIndex === rows.length - 1}
                      aria-label={`Move row ${rowIndex + 1} down`}
                      className={smallButton}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== rowIndex))}
                      className="ml-2 text-xs text-red-400 hover:underline"
                    >
                      Remove row
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {row.map((group, groupIndex) => (
                    <span
                      key={group}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-400 py-1 pl-1 pr-1 text-sm"
                    >
                      <button
                        onClick={() => moveGroup(rowIndex, groupIndex, -1)}
                        disabled={groupIndex === 0}
                        aria-label={`Move ${GROUP_LABELS[group]} earlier`}
                        className={smallButton}
                      >
                        ◀
                      </button>
                      <span className="px-1">{GROUP_LABELS[group]}</span>
                      <button
                        onClick={() => moveGroup(rowIndex, groupIndex, 1)}
                        disabled={groupIndex === row.length - 1}
                        aria-label={`Move ${GROUP_LABELS[group]} later`}
                        className={smallButton}
                      >
                        ▶
                      </button>
                      <button
                        onClick={() => updateRow(rowIndex, row.filter((g) => g !== group))}
                        aria-label={`Remove ${GROUP_LABELS[group]} from this row`}
                        className={smallButton}
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  {unassigned.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) updateRow(rowIndex, [...row, e.target.value as GroupCode]);
                      }}
                      className="rounded border border-dashed border-gray-400 bg-transparent px-2 py-1 text-sm"
                    >
                      <option value="" className="text-black">+ Add a group</option>
                      {unassigned.map((g) => (
                        <option key={g} value={g} className="text-black">
                          {GROUP_LABELS[g]}
                        </option>
                      ))}
                    </select>
                  )}

                  {row.length === 0 && unassigned.length === 0 && (
                    <span className="text-sm text-gray-500">Empty row</span>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <button
            onClick={() => setRows((prev) => [...prev, []])}
            className="mb-4 rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
          >
            + Add row
          </button>

          {unassigned.length > 0 && (
            <p className="mb-4 rounded bg-yellow-400/10 p-3 text-sm">
              Not in any row yet: {unassigned.map((g) => GROUP_LABELS[g]).join(", ")}. Cards in these groups will
              show up under &quot;Not assigned to a row&quot; for this box.
            </p>
          )}
        </>
      )}

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : isNew ? "Create" : "Save changes"}
        </button>
        <button onClick={onCancel} className="rounded border border-gray-400 px-4 py-2 hover:bg-gray-500/10">
          Cancel
        </button>
      </div>
    </section>
  );
}