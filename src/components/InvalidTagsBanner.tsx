/**
 * Site-wide banner shown to a logged-in user whose PDS record contains tags
 * that fail the profile tag-shape rule (`isValidProfileTag`).
 *
 * Public interface: default export, mounted once in RootLayout above <Nav />.
 * Owner context: layout chrome / Profile bounded context (read-only display).
 *
 * Behavior:
 *   - Anon (no session.did): renders nothing.
 *   - Authenticated, no invalid tags: renders nothing.
 *   - Authenticated, ≥1 invalid tags: renders a warning bar listing the
 *     offending tags with a link to the profile editor. The banner stays
 *     until the user re-saves a clean record (which clears the
 *     `has_invalid_tags` flag and removes the bad tags from `raw_record` on
 *     the next Jetstream upsert).
 *
 * Server-side React: reads the session cookie and the local index directly
 * — no extra round-trip, no client-side state.
 */
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getInvalidTagsForDid } from "@/lib/db/queries";

export default async function InvalidTagsBanner() {
  const session = await getSession();
  if (!session.did) return null;

  const invalid = getInvalidTagsForDid(session.did);
  if (invalid.length === 0) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-500/40 bg-amber-500/15 text-amber-100"
    >
      <div className="max-w-5xl mx-auto px-4 py-3 text-sm">
        <p className="font-semibold mb-1">
          Your profile is hidden from browse and matches.
        </p>
        <p className="mb-2">
          The following tags don&apos;t fit the format (lowercase letters,
          digits, internal hyphens; 2–64 characters):
        </p>
        <ul className="flex flex-wrap gap-2 mb-2">
          {invalid.map((tag) => (
            <li
              key={tag}
              className="inline-block rounded bg-amber-500/25 px-2 py-0.5 font-mono text-xs"
            >
              {tag}
            </li>
          ))}
        </ul>
        <p>
          <Link
            href="/profile/edit"
            className="underline font-semibold hover:text-white"
          >
            Open your profile
          </Link>{" "}
          to remove these and save — that re-publishes a clean record and
          restores your visibility.
        </p>
      </div>
    </div>
  );
}
