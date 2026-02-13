"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SessionData {
  authenticated: boolean;
  did?: string;
  handle?: string;
}

export default function Nav() {
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ authenticated: false });
    window.location.href = "/";
  }

  return (
    <nav className="border-b border-sky-800/50 bg-sky-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          Date<span className="text-sky-400">Sky</span>
        </Link>

        <div className="flex items-center gap-4">
          {session?.authenticated ? (
            <>
              <Link
                href="/browse"
                className="text-sm text-sky-300 hover:text-white transition-colors"
              >
                Browse
              </Link>
              <Link
                href="/profile/edit"
                className="text-sm text-sky-300 hover:text-white transition-colors"
              >
                My Profile
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-sky-400 hover:text-white transition-colors"
              >
                Log out
              </button>
              <span className="text-xs text-sky-500">
                @{session.handle}
              </span>
            </>
          ) : session === null ? (
            <span className="text-sm text-sky-600">...</span>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
