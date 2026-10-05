import { GROUP_LABELS, type GroupCode } from "@/lib/box-layout";

const VALID_GROUPS = new Set(Object.keys(GROUP_LABELS));

export const MAX_ROWS = 12;

// Trim extra spaces; names must be 1 to 60 characters
export function cleanName(input: unknown) {
  const name = String(input ?? "").trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 60 ? name : null;
}

// Rows must be a list of { groups: [...] }, with each group used at most once
export function cleanRows(input: unknown): { groups: GroupCode[] }[] | null {
  if (!Array.isArray(input) || input.length > MAX_ROWS) return null;

  const used = new Set<string>();
  const rows: { groups: GroupCode[] }[] = [];

  for (const row of input) {
    const groups = (row as { groups?: unknown })?.groups;
    if (!Array.isArray(groups)) return null;

    const clean: GroupCode[] = [];
    for (const group of groups) {
      if (typeof group !== "string" || !VALID_GROUPS.has(group) || used.has(group)) return null;
      used.add(group);
      clean.push(group as GroupCode);
    }
    rows.push({ groups: clean });
  }
  return rows;
}