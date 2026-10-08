// Smarter collection search: names, types, and rules text

export type SearchField = "all" | "name" | "type" | "text";

export const SEARCH_FIELDS: { value: SearchField; label: string; placeholder: string }[] = [
  { value: "all", label: "Everything", placeholder: 'Name, type, or rules text, like cat or "draw a card"' },
  { value: "name", label: "Name", placeholder: "Card name..." },
  { value: "type", label: "Type", placeholder: "Card or creature type, like Cat or Equipment" },
  { value: "text", label: "Rules text", placeholder: 'Abilities, like flying or "draw a card"' },
];

type Searchable = {
  name: string;
  type_line: string | null;
  oracle_text: string | null;
};

// Splits a search into terms: "quoted phrases" stay together, and -word leaves things out
function parseSearch(query: string) {
  const include: string[] = [];
  const exclude: string[] = [];
  const pattern = /(-?)"([^"]+)"|(-?)(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(query.toLowerCase())) !== null) {
    const negative = (match[1] || match[3]) === "-";
    const term = (match[2] ?? match[4] ?? "").trim();
    if (!term) continue;
    (negative ? exclude : include).push(term);
  }
  return { include, exclude };
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Matches a term at the start of a word, so "cat" finds "Cat" but not "dedicate"
const startsWord = (term: string) => new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}`);

// Builds a checker for a search, to run against each card
export function makeMatcher(query: string, field: SearchField = "all") {
  const { include, exclude } = parseSearch(query);
  const wanted = include.map(startsWord);
  const unwanted = exclude.map(startsWord);

  return (card: Searchable) => {
    if (wanted.length === 0 && unwanted.length === 0) return true;

    const name = card.name.toLowerCase();
    const type = (card.type_line ?? "").toLowerCase();
    const text = (card.oracle_text ?? "").toLowerCase();
    const haystack =
      field === "name" ? name : field === "type" ? type : field === "text" ? text : `${name}\n${type}\n${text}`;

    return wanted.every((re) => re.test(haystack)) && !unwanted.some((re) => re.test(haystack));
  };
}