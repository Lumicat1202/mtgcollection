"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/add", label: "Add" },
  { href: "/import", label: "Import" },
  { href: "/collection", label: "Collection" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 border-b border-gray-400/40 bg-white/90 backdrop-blur dark:bg-black/80">
      <div className="mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-4 py-3">
        <span className="mr-4 whitespace-nowrap font-bold">🃏 MTG Collection</span>
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-sm ${
                active ? "bg-blue-600 text-white" : "hover:bg-gray-500/10"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}