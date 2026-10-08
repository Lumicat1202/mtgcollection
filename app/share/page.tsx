"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

// 3 to 30 characters: lowercase letters, numbers, dashes, underscores
const HANDLE_RULE = /^[a-z0-9_-]{3,30}$/;

export default function SharePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [showPrices, setShowPrices] = useState(true);
  const [saved, setSaved] = useState<{ handle: string; isPublic: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("handle, is_public, show_prices")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setHandle(data.handle ?? "");
        setIsPublic(data.is_public);
        setShowPrices(data.show_prices);
        if (data.handle) setSaved({ handle: data.handle, isPublic: data.is_public });
      }
    })().finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!userId) return;
    const clean = handle.trim().toLowerCase();
    if (!HANDLE_RULE.test(clean)) {
      setNotice({
        type: "error",
        text: "Link names need 3 to 30 characters: lowercase letters, numbers, dashes, or underscores.",
      });
      return;
    }

    setSaving(true);
    setNotice(null);
    const { error } = await createClient()
      .from("profiles")
      .upsert({
        user_id: userId,
        handle: clean,
        is_public: isPublic,
        show_prices: showPrices,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);

    if (error) {
      setNotice({
        type: "error",
        text: error.code === "23505" ? `Someone already uses "${clean}". Try another name.` : error.message,
      });
      return;
    }

    setHandle(clean);
    setSaved({ handle: clean, isPublic });
    setNotice({
      type: "success",
      text: isPublic ? "Saved. Your collection is shared." : "Saved. Your collection is private.",
    });
  }

  const link = saved ? `${origin}/u/${saved.handle}` : "";

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <p className="p-6">Loading your sharing settings...</p>;

  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Share your collection</h1>
      <p className="mb-6 text-sm text-gray-500">
        Get a link anyone can open to browse your cards, no account needed. Your email, boxes, and settings are
        never shown.
      </p>

      <label className="mb-5 block text-sm">
        Link name
        <div className="mt-1 flex items-center overflow-hidden rounded border border-gray-400">
          <span className="whitespace-nowrap bg-gray-500/10 px-3 py-2 text-gray-500">/u/</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="e.g. daniel"
            maxLength={30}
            className="w-full bg-transparent px-3 py-2"
          />
        </div>
        <span className="mt-1 block text-xs text-gray-500">
          Lowercase letters, numbers, dashes, or underscores.
        </span>
      </label>

      <label className="mb-3 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-yellow-400"
        />
        <span>
          <span className="block font-semibold">Share my collection</span>
          <span className="text-gray-500">Anyone with the link can see your cards.</span>
        </span>
      </label>

      <label className="mb-6 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={showPrices}
          onChange={(e) => setShowPrices(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-yellow-400"
        />
        <span>
          <span className="block font-semibold">Show prices</span>
          <span className="text-gray-500">Card prices, total value, and your most valuable cards.</span>
        </span>
      </label>

      <button
        onClick={save}
        disabled={saving || !handle.trim()}
        className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>

      {notice && (
        <p className={`mt-4 text-sm ${notice.type === "success" ? "text-green-400" : "text-red-500"}`}>
          {notice.text}
        </p>
      )}

      {saved?.isPublic && (
        <div className="mt-8 rounded-lg border border-yellow-400/40 p-4">
          <p className="mb-2 font-semibold">Your public link</p>
          <p className="mb-3 break-all rounded bg-gray-500/10 px-3 py-2 text-sm">{link}</p>
          <div className="flex gap-3">
            <button
              onClick={copyLink}
              className="rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
            >
              {copied ? "Copied!" : "📋 Copy link"}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-500/10"
            >
              Open it
            </a>
          </div>
        </div>
      )}
    </main>
  );
}