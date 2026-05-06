"use client";

/**
 * Settings-page sign-out trigger.
 *
 * Public interface: default export, used at the bottom of /settings.
 * Owner context: settings.
 *
 * Logout was previously in the top nav; on mobile we collapsed the nav and moved
 * destructive/rare actions here so they don't crowd the bottom tab bar.
 */
import { useState } from "react";

export default function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="text-sm text-sky-400 hover:text-white underline transition-colors disabled:opacity-50"
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
