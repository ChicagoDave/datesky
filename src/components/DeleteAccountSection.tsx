"use client";

/**
 * Danger-zone section for irreversible account deletion.
 *
 * Public interface: default export, rendered at the bottom of /settings.
 *
 * Owner context: Settings UI / PublicSurface bounded context.
 *
 * Confirmation pattern follows ADR-0005: typed `DELETE` (case-insensitive,
 * trimmed) gates the destructive button. The friction is a UI guard against
 * accidental clicks; the API handler does not validate the typed string.
 *
 * Post-delete navigation follows Decision 5B (`docs/context/plan.md`):
 * redirect to `/goodbye` so the user lands on a no-auth, warm farewell page.
 */
import { useState } from "react";

const REQUIRED_PHRASE = "DELETE";

export default function DeleteAccountSection() {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim().toUpperCase() === REQUIRED_PHRASE;

  async function handleDelete() {
    if (!armed || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || "Could not delete account. Please try again.");
        setDeleting(false);
        return;
      }
      // Use a hard navigation so the destroyed iron-session cookie is fully
      // shed by the browser and the next page load runs from a clean state.
      window.location.href = "/goodbye";
    } catch {
      setError("Network error. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-red-300">
          Delete my account
        </h3>
        <p className="text-sm text-sky-300">
          Removes your profile from your PDS and clears all of your data on
          Nomare. This cannot be undone.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="delete-confirm"
          className="block text-xs text-sky-400"
        >
          Type <span className="font-mono text-red-300">DELETE</span> to enable
          the button.
        </label>
        <input
          id="delete-confirm"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type DELETE to confirm"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Type DELETE to confirm account deletion"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-sky-600 focus:outline-none focus:border-red-400 font-mono"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleDelete}
          disabled={!armed || deleting}
          className="bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:text-red-300 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
