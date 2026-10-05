"use client";

import { useEffect, useState } from "react";

type Art = { image: string; name: string; artist: string };

// Random artwork from legendary creatures, fitting for Commander
const ART_QUERY = "type:legendary type:creature game:paper";

export default function ArtBackground() {
  const [art, setArt] = useState<Art | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`https://api.scryfall.com/cards/random?q=${encodeURIComponent(ART_QUERY)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((card) => {
        const image =
          card?.image_uris?.art_crop ?? card?.card_faces?.[0]?.image_uris?.art_crop;
        if (image) {
          setArt({ image, name: card.name, artist: card.artist ?? "Unknown artist" });
        }
      })
      .catch(() => {
        // If Scryfall can't be reached, the plain dark background stays
      });
  }, []);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art.image}
            alt=""
            onLoad={() => setLoaded(true)}
            className={`h-full w-full scale-110 object-cover blur-[3px] saturate-[1.15] transition-opacity duration-1000 motion-reduce:transition-none ${
              loaded ? "opacity-60" : "opacity-0"
            }`}
          />
        )}
        {/* Darkens the edges so the middle stays readable */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(18,15,26,0.2)_0%,rgba(18,15,26,0.6)_55%,rgba(18,15,26,0.95)_100%)]" />
      </div>

      {art && (
        <p className="pointer-events-none fixed bottom-2 right-3 hidden text-xs text-gray-500 sm:block">
          {art.name}, art by {art.artist}
        </p>
      )}
    </>
  );
}