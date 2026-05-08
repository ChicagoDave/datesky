"use client";

/**
 * Top navigation bar.
 *
 * Public interface: default export, mounted once in RootLayout.
 * Owner context: layout chrome.
 *
 * Mobile: minimal — logo + About + @handle (auth) or About only (anon).
 *   Primary navigation lives in <MobileTabBar /> at the bottom of the viewport.
 * Desktop: full horizontal layout with all destinations and the sign-out button.
 */
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
    <nav className="border-b border-white/10 bg-[#0f0817]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="text-xl font-bold flex-shrink-0">
          <span className="bg-gradient-to-r from-[#d60270] via-[#9b4f96] to-[#0038a8] bg-clip-text text-transparent">
            Nomare
          </span>
        </Link>

        {/* Mobile right-side: minimal */}
        <div className="flex md:hidden items-center gap-3 min-w-0 flex-1 justify-end">
          <Link
            href="/about"
            className="text-sm text-sky-300 hover:text-white transition-colors flex-shrink-0"
          >
            About
          </Link>
          {session?.authenticated && session.handle && (
            <span className="text-xs text-sky-500 truncate min-w-0">
              @{session.handle}
            </span>
          )}
        </div>

        {/* Desktop right-side: full menu */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/about"
            className="text-sm text-sky-300 hover:text-white transition-colors"
          >
            About
          </Link>
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
              <Link
                href="/settings"
                className="text-sm text-sky-300 hover:text-white transition-colors"
              >
                Settings
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
