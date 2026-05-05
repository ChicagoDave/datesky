"use client";

import { useState } from "react";

export default function LoginButton() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }

      setError(
        typeof data.error === "string"
          ? data.error
          : "Sign-in didn't start. Please try again."
      );
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!showInput) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setShowInput(true)}
          className="bg-gradient-to-r from-[#d60270] to-[#9b4f96] hover:from-[#e0357a] hover:to-[#a95fa8] text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg shadow-[#d60270]/20"
        >
          Sign in with your atproto account
        </button>
        <p className="text-sky-500 text-xs">
          Works with Bluesky, Blacksky, or any AT Protocol PDS — you authorize on your provider, not here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <form onSubmit={handleLogin} className="flex gap-2">
        <input
          type="text"
          placeholder="your-handle.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
          autoFocus
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !handle.trim()}
          className="bg-gradient-to-r from-[#d60270] to-[#9b4f96] hover:from-[#e0357a] hover:to-[#a95fa8] disabled:from-sky-800 disabled:to-sky-800 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {loading ? "..." : "Go"}
        </button>
      </form>
      {error && (
        <p
          role="alert"
          className="text-pink-300 text-sm max-w-md text-center px-2"
        >
          {error}
        </p>
      )}
      <p className="text-sky-500 text-xs">
        Enter your atproto handle (e.g. <code>you.bsky.social</code>) — you authorize on your provider, not here
      </p>
    </div>
  );
}
