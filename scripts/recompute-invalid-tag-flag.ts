/**
 * Operator-run backfill for the `profiles.has_invalid_tags` column.
 *
 * Walks every profile row, parses `raw_record`, applies `isValidProfileTag` to
 * each tag, and recomputes the flag. Used once after the column is introduced
 * so existing polluted users are hidden from browse/match immediately —
 * without it, a polluted row's flag stays 0 (the default) until the user
 * happens to publish another update through Jetstream.
 *
 * Dry-run by default — pass `--apply` to actually update rows.
 *
 *   npx tsx scripts/recompute-invalid-tag-flag.ts           # report only
 *   npx tsx scripts/recompute-invalid-tag-flag.ts --apply   # write changes
 *
 * Idempotent: running again after `--apply` reports zero mismatches.
 *
 * The core logic lives in `src/lib/profile/invalid-tag-flag.ts` so it can be
 * exercised against an in-memory DB by the indexer test suite.
 *
 * Owner context: Profile bounded context — operational tooling.
 */
import Database from "better-sqlite3";
import path from "path";
import { recomputeInvalidTagFlag } from "../src/lib/profile/invalid-tag-flag";

const apply = process.argv.includes("--apply");
const DB_PATH = path.join(process.cwd(), "data", "nomare.db");

const db = new Database(DB_PATH, { readonly: !apply });

const result = recomputeInvalidTagFlag(db, { apply });

const mode = apply ? "APPLY" : "DRY-RUN";
console.log(`Mode: ${mode}`);
console.log(`Scanned ${result.scanned} profile(s).`);

if (result.mismatches.length === 0) {
  console.log("All flags already match — nothing to do.");
  db.close();
  process.exit(0);
}

console.log(`Found ${result.mismatches.length} flag mismatch(es):\n`);
for (const m of result.mismatches) {
  console.log(`  ${m.did}: ${m.was} -> ${m.now}`);
}

if (apply) {
  console.log(`\nUpdated ${result.updated} row(s).`);
  console.log(
    "Polluted profiles are now hidden from browse and match. Affected users see the site-wide banner until they re-save a clean profile."
  );
} else {
  console.log("\nDry-run only. Re-run with --apply to update these rows.");
}

db.close();
process.exit(0);
