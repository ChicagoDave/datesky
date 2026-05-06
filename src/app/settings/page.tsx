/**
 * Settings page — viewer-private preferences.
 *
 * Public interface: server component that gates on session and renders the form client.
 * Owner context: settings.
 *
 * Per ADR 0001, every preference managed here is private to DateSky's database.
 * Future match-mode preferences will live in the same form alongside photos and compact view.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserPreferences } from "@/lib/db/queries";
import SettingsForm from "./SettingsForm";
import SignOutButton from "@/components/SignOutButton";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Settings — DateSky",
  description: "Your viewing preferences for DateSky.",
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.did) {
    redirect("/");
  }

  const prefs = getUserPreferences(session.did);

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <header className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sky-300 text-sm">
          These preferences are private. They never leave DateSky&apos;s database.
        </p>
      </header>

      <SettingsForm initial={prefs} />

      <section className="mt-12 pt-6 border-t border-white/10 space-y-2">
        <h2 className="text-sm font-semibold text-sky-300">Coming soon</h2>
        <ul className="text-sm text-sky-500 space-y-1">
          <li>· Light / dark theme</li>
        </ul>
      </section>

      <section className="mt-10 pt-6 border-t border-white/10">
        <h2 className="text-sm font-semibold text-sky-300 uppercase tracking-wide mb-3">
          Account
        </h2>
        <SignOutButton />
      </section>
    </main>
  );
}
