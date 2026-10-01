import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-3xl font-bold">MTG Collection</h1>
      <div className="flex flex-col gap-3">
        <Link href="/add" className="rounded border border-gray-400 px-4 py-3 hover:bg-gray-500/10">
          ➕ Add cards
        </Link>
        <Link href="/collection" className="rounded border border-gray-400 px-4 py-3 hover:bg-gray-500/10">
          📚 View collection
        </Link>
        <Link href="/import" className="rounded border border-gray-400 px-4 py-3 hover:bg-gray-500/10">
          📥 Import from ManaBox
        </Link>
      </div>
    </main>
  );
}