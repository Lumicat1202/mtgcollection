"use client";

import { useEffect, useState } from "react";
import type { Location } from "@/lib/box-layout";

const SOMEWHERE_ELSE = "__new__";

type Props = {
  value: string;
  onChange: (name: string) => void;
  onLocations?: (locations: Location[]) => void;
};

// A dropdown of your boxes, with an option to type a new location name
export default function BoxPicker({ value, onChange, onLocations }: Props) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [typing, setTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        const list: Location[] = data.locations ?? [];
        setLocations(list);
        onLocations?.(list);
        if (list.length === 0) setTyping(true);
        else if (!value) onChange(list[0].name);
      })
      .catch(() => setTyping(true))
      .finally(() => setLoaded(true));
    // Only load once when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) return <p className="mt-1 text-sm text-gray-500">Loading your boxes...</p>;

  if (typing) {
    return (
      <div className="mt-1 flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Location name, like Trade binder"
          className="w-full rounded border border-gray-400 bg-transparent px-3 py-2"
        />
        {locations.length > 0 && (
          <button
            onClick={() => {
              setTyping(false);
              onChange(locations[0].name);
            }}
            className="whitespace-nowrap rounded border border-gray-400 px-3 py-2 text-sm hover:bg-gray-500/10"
          >
            Pick a box
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === SOMEWHERE_ELSE) {
          setTyping(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
    >
      {locations.map((l) => (
        <option key={l.id} value={l.name} className="text-black">
          {l.name}
          {l.kind === "box" ? ` (${l.rows.length} rows)` : ""}
        </option>
      ))}
      <option value={SOMEWHERE_ELSE} className="text-black">
        + Somewhere else (type a name)
      </option>
    </select>
  );
}