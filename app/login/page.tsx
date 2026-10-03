"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (!data.session) {
        setNotice("Account created! Check your email to confirm it, then log in.");
        setMode("login");
        setLoading(false);
        return;
      }
    }

    router.push("/collection");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-1 text-center text-3xl font-bold">🃏 MTG Collection</h1>
      <p className="mb-8 text-center text-sm text-gray-500">
        {mode === "login" ? "Log in to your collection" : "Create your own collection"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded border border-gray-400 bg-transparent px-3 py-2"
          />
          {mode === "signup" && (
            <span className="mt-1 block text-xs text-gray-500">At least 6 characters</span>
          )}
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      {error && <p className="mt-4 text-center text-sm text-red-500">{error}</p>}
      {notice && <p className="mt-4 text-center text-sm text-green-500">{notice}</p>}

      <p className="mt-6 text-center text-sm text-gray-500">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setNotice(null);
          }}
          className="text-blue-500 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
    </main>
  );
}