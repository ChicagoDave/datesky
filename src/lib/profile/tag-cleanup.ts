/**
 * One-shot cleanup of malformed rows in the `profile_tags` index.
 *
 * Public interface: `removeInvalidTags(db, opts)` and `CleanupReport`.
 * Owner context: Profile bounded context — operational tooling for retroactively
 * removing tags that were accepted before `isValidProfileTag` was added.
 *
 * Note: this only cleans the LOCAL index. The user's published AT Protocol
 * record on their PDS still contains the malformed tags until they re-save
 * their profile through the now-validated form (or an explicit PDS write
 * happens with their session). The Jetstream subscriber may re-insert the
 * malformed tags on the next profile update unless callers also filter at
 * insert time.
 */
import type Database from "better-sqlite3";
import { isValidProfileTag } from "./tag-validation";

export interface CleanupReport {
  scanned: number;
  invalid: { did: string; tag: string; reason: string }[];
  removed: number;
  apply: boolean;
}

/**
 * Scan `profile_tags` and report (and optionally remove) rows whose `tag`
 * column fails validation.
 *
 * @param db    An open `better-sqlite3` Database. Caller owns its lifecycle.
 * @param opts  `{ apply }` — when `false` (default), the function reports only
 *              and does not mutate. When `true`, invalid rows are deleted in a
 *              single transaction.
 * @returns A `CleanupReport` describing what was found and what was removed.
 *          The `removed` field is always `0` when `apply: false`.
 */
export function removeInvalidTags(
  db: Database.Database,
  opts: { apply: boolean }
): CleanupReport {
  const rows = db
    .prepare("SELECT did, tag FROM profile_tags")
    .all() as { did: string; tag: string }[];

  const invalid: { did: string; tag: string; reason: string }[] = [];
  for (const row of rows) {
    const result = isValidProfileTag(row.tag);
    if (!result.ok) {
      invalid.push({ did: row.did, tag: row.tag, reason: result.reason });
    }
  }

  let removed = 0;
  if (opts.apply && invalid.length > 0) {
    const stmt = db.prepare(
      "DELETE FROM profile_tags WHERE did = ? AND tag = ?"
    );
    const tx = db.transaction(
      (items: { did: string; tag: string }[]) => {
        let count = 0;
        for (const item of items) {
          const info = stmt.run(item.did, item.tag);
          count += info.changes;
        }
        return count;
      }
    );
    removed = tx(invalid);
  }

  return {
    scanned: rows.length,
    invalid,
    removed,
    apply: opts.apply,
  };
}
