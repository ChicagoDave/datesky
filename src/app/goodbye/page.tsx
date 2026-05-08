/**
 * /goodbye — landing page after a successful account deletion.
 *
 * Public interface: server component, no auth gate, no logged-in chrome
 * concerns (the user has just been signed out by `POST /api/account/delete`).
 *
 * Owner context: PublicSurface bounded context. Decision 5B in
 * `docs/context/plan.md` selected a dedicated farewell page over a flash banner
 * because deletion is irreversible and emotional — a quiet, intentional landing
 * is warmer than dropping the user back on a marketing page.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Goodbye — Nomare",
  description: "Your Nomare account has been deleted.",
};

export default function GoodbyePage() {
  return (
    <main className="max-w-xl mx-auto px-4 py-20 text-center space-y-8">
      <h1 className="text-3xl font-bold">Your account has been deleted.</h1>

      <div className="space-y-4 text-sky-300">
        <p>
          Your profile records have been removed from your PDS and from Nomare.
          Nothing about you remains in our database.
        </p>
        <p>
          Thanks for being part of the network. If you change your mind, you
          can sign up again anytime — just sign in with Bluesky and create a
          fresh profile.
        </p>
      </div>

      <div className="pt-4">
        <Link
          href="/"
          className="inline-block bg-gradient-to-r from-[#d60270] to-[#9b4f96] hover:from-[#e0357a] hover:to-[#a95fa8] text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
