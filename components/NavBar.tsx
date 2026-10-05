"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const links = [
  { href: "/", label: "Home" },
  { href: "/add", label: "Add" },
  { href: "/import", label: "Import" },
  { href: "/collection", label: "Collection" },
  { href: "/boxes", label: "Boxes" },
  { href: "/deck", label: "Deck Builder" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  // Keep track of who is signed in
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function logOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // No nav bar on the login page
  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-20 border-b border-gray-400/40 bg-white/90 backdrop-blur dark:bg-black/80">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-3">
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

        <div className="ml-auto flex items-center gap-3 pl-4">
          {email && <span className="hidden whitespace-nowrap text-sm text-gray-500 md:inline">{email}</span>}
          <button
            onClick={logOut}
            className="whitespace-nowrap rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}