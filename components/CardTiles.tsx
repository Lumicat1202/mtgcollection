"use client";

// Shared card display: a grid of pictures or a compact list

export const VALUABLE_PRICE = 5;

export type Card = {
  id: string;
  name: string;
  set_code: string | null;
  collector_number: string | null;
  quantity: number;
  foil: boolean;
  box: string;
  colors: string[];
  type_line: string | null;
  mana_value: number | null;
  oracle_text: string | null;
  rarity: string | null;
  image_url: string | null;
  price_usd: number | null;
};

export function priceOf(card: Card) {
  return card.price_usd != null ? Number(card.price_usd) : 0;
}

export function isValuable(card: Card) {
  return priceOf(card) >= VALUABLE_PRICE;
}

export function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function ValueBadge() {
  return (
    <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-extrabold text-black shadow">$$</span>
  );
}

type Props = {
  cards: Card[];
  view: "grid" | "list";
  onOpen: (card: Card) => void;
  caption?: (card: Card) => string;
};

export default function CardTiles({ cards, view, onOpen, caption }: Props) {
  if (view === "grid") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {cards.map((card) => (
          <button key={card.id} onClick={() => onOpen(card)} className="group text-left">
            <div className="relative">
              {card.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.image_url}
                  alt={card.name}
                  loading="lazy"
                  className={`w-full rounded-lg shadow transition group-hover:scale-[1.03] ${
                    isValuable(card) ? "ring-4 ring-yellow-400" : ""
                  }`}
                />
              ) : (
                <div
                  className={`flex aspect-[488/680] items-center justify-center rounded-lg border p-2 text-center text-sm ${
                    isValuable(card) ? "border-yellow-400 ring-4 ring-yellow-400" : "border-gray-400"
                  }`}
                >
                  {card.name}
                </div>
              )}
              {isValuable(card) && (
                <span className="absolute right-2 top-2">
                  <ValueBadge />
                </span>
              )}
              {card.quantity > 1 && (
                <span className="absolute bottom-2 right-2 rounded-full bg-black/80 px-2 py-0.5 text-xs font-bold text-white">
                  {card.quantity}x
                </span>
              )}
              {card.foil && (
                <span className="absolute bottom-2 left-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">
                  Foil
                </span>
              )}
            </div>
            <p className="mt-1 flex justify-between gap-2 text-xs">
              <span className="truncate text-gray-500">{caption ? caption(card) : ""}</span>
              <span
                className={`whitespace-nowrap font-semibold ${
                  isValuable(card) ? "text-yellow-500" : "text-green-500"
                }`}
              >
                {priceOf(card) > 0 ? money(priceOf(card)) : "—"}
              </span>
            </p>
          </button>
        ))}
      </div>
    );
  }

  return (
    <table className="w-full table-fixed text-sm">
      <tbody>
        {cards.map((card) => (
          <tr
            key={card.id}
            onClick={() => onOpen(card)}
            className={`cursor-pointer border-b border-gray-700/30 hover:bg-gray-500/10 ${
              isValuable(card) ? "bg-yellow-400/10" : ""
            }`}
          >
            <td className="w-10 py-1">{card.quantity}x</td>
            <td className="truncate py-1 pr-3">
              {card.name}
              {card.foil && <span className="ml-2 text-xs text-amber-400">foil</span>}
              {isValuable(card) && (
                <span className="ml-2">
                  <ValueBadge />
                </span>
              )}
            </td>
            <td className="w-16 whitespace-nowrap py-1 text-gray-500">MV {card.mana_value ?? 0}</td>
            <td className="w-14 py-1 uppercase text-gray-500">{card.set_code}</td>
            <td
              className={`w-20 whitespace-nowrap py-1 pr-3 text-right ${
                isValuable(card) ? "font-bold text-yellow-500" : "text-green-500"
              }`}
            >
              {priceOf(card) > 0 ? money(priceOf(card)) : "—"}
            </td>
            {caption && <td className="w-32 truncate py-1 text-right text-gray-500">{caption(card)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}