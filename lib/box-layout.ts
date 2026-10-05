// Everything about where a card goes inside a box

export type GroupCode =
  | "W" | "U" | "B" | "R" | "G" | "C"
  | "BASIC" | "LANDS" | "TOKENS" | "MULTI";

export type Location = {
  id: string;
  name: string;
  kind: "box" | "other";
  rows: { groups: GroupCode[] }[];
};

export type PlaceableCard = {
  name: string;
  colors: string[] | null;
  type_line: string | null;
  mana_value: number | null;
};

export const GROUP_LABELS: Record<GroupCode, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
  BASIC: "Basic lands",
  LANDS: "Multilands",
  TOKENS: "Tokens",
  MULTI: "Multicolor",
};

export const TYPE_ORDER = [
  "Creature", "Planeswalker", "Battle", "Instant", "Sorcery",
  "Artifact", "Enchantment", "Land", "Other",
];

const WUBRG = ["W", "U", "B", "R", "G"];
const COLOR_WORDS: Record<string, string> = {
  W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
};

function frontType(card: PlaceableCard) {
  return (card.type_line ?? "").split("//")[0];
}

// Which group a card belongs to: a color, colorless, lands, tokens, or multicolor
export function groupOf(card: PlaceableCard): GroupCode {
  const type = frontType(card);
  if (type.includes("Token")) return "TOKENS";
  if (/\bLand\b/.test(type)) return type.includes("Basic") ? "BASIC" : "LANDS";
  const colors = card.colors ?? [];
  if (colors.length > 1) return "MULTI";
  if (colors.length === 1 && WUBRG.includes(colors[0])) return colors[0] as GroupCode;
  return "C";
}

// The card's main spell type, like Creature or Sorcery
export function typeOf(card: PlaceableCard) {
  const type = frontType(card);
  return TYPE_ORDER.find((t) => type.includes(t)) ?? "Other";
}

// Multicolor combination in Magic's standard order, like "UB"
export function comboKey(card: PlaceableCard) {
  return WUBRG.filter((c) => (card.colors ?? []).includes(c)).join("");
}

// "UB" becomes "Blue-Black"
export function comboName(key: string) {
  return key.split("").map((c) => COLOR_WORDS[c]).join("-");
}

// Two-color pairs first, then three-color and up, each in standard order
function comboRank(key: string) {
  return `${key.length}-${key.split("").map((c) => WUBRG.indexOf(c)).join("")}`;
}

const byManaThenName = (a: PlaceableCard, b: PlaceableCard) =>
  (a.mana_value ?? 0) - (b.mana_value ?? 0) || a.name.localeCompare(b.name);
const byName = (a: PlaceableCard, b: PlaceableCard) => a.name.localeCompare(b.name);

// Which row a group lives in for this box (null if it's not a box or not in a row)
export function rowFor(group: GroupCode, location: Location | null | undefined): number | null {
  if (!location || location.kind !== "box") return null;
  const index = location.rows.findIndex((r) => r.groups.includes(group));
  return index >= 0 ? index + 1 : null;
}

// The section a card files under, like "Black · Sorcery" or "Blue-Black · Creature"
export function sectionName(card: PlaceableCard) {
  const group = groupOf(card);
  if (group === "BASIC" || group === "LANDS" || group === "TOKENS") return GROUP_LABELS[group];
  if (group === "MULTI") return `${comboName(comboKey(card))} · ${typeOf(card)}`;
  return `${GROUP_LABELS[group]} · ${typeOf(card)}`;
}

// Full spot within a box, like "Row 2 · Black · Sorcery"
export function placementLabel(card: PlaceableCard, location: Location | null | undefined) {
  const row = rowFor(groupOf(card), location);
  const section = sectionName(card);
  return row ? `Row ${row} · ${section}` : section;
}

// ---- Box view: cards laid out row by row, exactly like the real box ----

export type BoxSection<T> = { title: string; cards: T[] };
export type BoxGroupView<T> = { group: GroupCode; title: string; sections: BoxSection<T>[] };
export type BoxRowView<T> = { row: number; groups: BoxGroupView<T>[] };

function byType<T extends PlaceableCard>(cards: T[]): BoxSection<T>[] {
  return TYPE_ORDER.map((type) => ({
    title: type,
    cards: cards.filter((c) => typeOf(c) === type).sort(byManaThenName),
  })).filter((s) => s.cards.length > 0);
}

function sectionsFor<T extends PlaceableCard>(group: GroupCode, cards: T[]): BoxSection<T>[] {
  if (cards.length === 0) return [];

  // Lands and tokens: one alphabetical list
  if (group === "BASIC" || group === "LANDS" || group === "TOKENS") {
    return [{ title: "", cards: [...cards].sort(byName) }];
  }

  // Multicolor: by color combination, then by spell type
  if (group === "MULTI") {
    const combos = new Map<string, T[]>();
    for (const card of cards) {
      const key = comboKey(card);
      combos.set(key, [...(combos.get(key) ?? []), card]);
    }
    const keys = Array.from(combos.keys()).sort((a, b) => comboRank(a).localeCompare(comboRank(b)));
    return keys.flatMap((key) =>
      byType(combos.get(key)!).map((s) => ({ title: `${comboName(key)} · ${s.title}`, cards: s.cards }))
    );
  }

  // Single colors and colorless: by spell type
  return byType(cards);
}

export function buildBoxView<T extends PlaceableCard>(cards: T[], location: Location) {
  const groups = new Map<GroupCode, T[]>();
  for (const card of cards) {
    const group = groupOf(card);
    groups.set(group, [...(groups.get(group) ?? []), card]);
  }

  const placed = new Set<GroupCode>();
  const rows: BoxRowView<T>[] = location.rows.map((row, index) => ({
    row: index + 1,
    groups: row.groups
      .map((group) => {
        placed.add(group);
        return { group, title: GROUP_LABELS[group], sections: sectionsFor(group, groups.get(group) ?? []) };
      })
      .filter((g) => g.sections.length > 0),
  }));

  // Cards whose group isn't assigned to any row in this box
  const unplaced = cards.filter((c) => !placed.has(groupOf(c)));
  return { rows, unplaced };
}