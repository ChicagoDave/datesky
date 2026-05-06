"use client";

/**
 * Mobile-only bottom tab bar for primary navigation between authenticated surfaces.
 *
 * Public interface: rendered globally from RootLayout; auto-hides itself for
 *   unauthenticated visitors and on viewports >= md.
 * Owner context: layout chrome.
 *
 * Three tabs: Browse (label includes Match indicator when match mode is on),
 *   Profile, Settings. Active tab is detected from the current pathname.
 *
 * Mounted alongside <Nav> in RootLayout. Both fetch the session independently;
 * that costs one extra round trip but keeps the components self-contained and
 * lets each handle its own loading state.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SessionData {
  authenticated: boolean;
  handle?: string;
}

interface Tab {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  {
    href: "/browse",
    label: "Browse",
    isActive: (p) => p.startsWith("/browse"),
  },
  {
    href: "/profile/edit",
    label: "Profile",
    isActive: (p) => p.startsWith("/profile"),
  },
  {
    href: "/settings",
    label: "Settings",
    isActive: (p) => p.startsWith("/settings"),
  },
];

export default function MobileTabBar() {
  const pathname = usePathname() || "/";
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  if (!session?.authenticated) return null;

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0f0817]/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-3">
        {TABS.map((tab) => {
          const active = tab.isActive(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "relative flex items-center justify-center py-3 text-sm font-semibold text-white"
                  : "relative flex items-center justify-center py-3 text-sm font-medium text-sky-400 hover:text-white transition-colors"
              }
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-[#d60270] via-[#9b4f96] to-[#0038a8]"
                />
              )}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
