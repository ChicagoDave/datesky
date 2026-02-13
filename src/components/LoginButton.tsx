"use client";

import { useState } from "react";

export default function LoginButton() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        Log in with Bluesky
      </button>
    );
  }

  return (
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
        className="bg-sky-500 hover:bg-sky-400 disabled:bg-sky-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
      >
        {loading ? "..." : "Go"}
      </button>
    </form>
  );
}
