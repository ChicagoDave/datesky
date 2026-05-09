/**
 * Recompute `profiles.has_invalid_tags` for every row by re-validating the
 * tags stored inside `raw_record`. Used as a one-shot backfill after the
 * column is introduced so existing polluted rows are hidden from browse and
 * match without waiting for each affected user to publish another update.
 *
 * Public interface: `recomputeInvalidTagFlag(db, { apply })`.
 * Owner context: Profile bounded context — operational tooling.
 */
import type Database from "better-sqlite3";
import { isValidProfileTag, normalizeTag } from "./tag-validation";

export interface FlagMismatch {
  did: string;
  was: number;
  now: number;
}

export interface RecomputeResult {
  scanned: number;
  mismatches: FlagMismatch[];
  updated: number;
  apply: boolean;
}

/**
 * Scan every `profiles` row, recompute the flag from `raw_record.tags`, and
 * report (or apply) the diff.
 *
 * @param db    Open `better-sqlite3` handle. Caller owns the lifecycle.
 * @param opts  `{ apply }` — when false, the function reports mismatches but
 *              does not touch the database. When true, mismatches are written
 *              in a single transaction.
 * @returns     `{ scanned, mismatches, updated, apply }`. `updated` is 0 in
 *              dry-run mode regardless of how many mismatches were found.
 */
export function recomputeInvalidTagFlag(
  db: Database.Database,
  opts: { apply: boolean }
): RecomputeResult {
  const rows = db
    .prepare("SELECT did, raw_record, has_invalid_tags FROM profiles")
    .all() as {
    did: string;
    raw_record: string | null;
    has_invalid_tags: number;
  }[];

  const mismatches: FlagMismatch[] = [];
  for (const row of rows) {
    const computed = computeFlagFromRaw(row.raw_record);
    if (computed !== row.has_invalid_tags) {
      mismatches.push({
        did: row.did,
        was: row.has_invalid_tags,
        now: computed,
      });
    }
  }

  let updated = 0;
  if (opts.apply && mismatches.length > 0) {
    const update = db.prepare(
      "UPDATE profiles SET has_invalid_tags = ? WHERE did = ?"
    );
    const tx = db.transaction((items: FlagMismatch[]) => {
      for (const item of items) update.run(item.now, item.did);
    });
    tx(mismatches);
    updated = mismatches.length;
  }

  return {
    scanned: rows.length,
    mismatches,
    updated,
    apply: opts.apply,
  };
}

/**
 * Compute the flag for a single raw_record JSON string. Returns 0 when the
 * record is missing, malformed, or has no `tags` array, or when every tag
 * passes validation after normalization. Returns 1 if any tag is non-string
 * or still fails the rule once normalized — whitespace and casing are not
 * pollution, they normalize away.
 */
function computeFlagFromRaw(raw: string | null): number {
  if (!raw) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!parsed || typeof parsed !== "object") return 0;
  const tags = (parsed as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return 0;
  return tags.some(
    (t) => typeof t !== "string" || !isValidProfileTag(normalizeTag(t)).ok
  )
    ? 1
    : 0;
}
