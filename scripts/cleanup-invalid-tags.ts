/**
 * Operator-run cleanup of malformed rows in the local `profile_tags` index.
 *
 * Dry-run by default — pass `--apply` to actually delete rows.
 *
 *   npx tsx scripts/cleanup-invalid-tags.ts          # dry-run (report only)
 *   npx tsx scripts/cleanup-invalid-tags.ts --apply  # delete invalid rows
 *
 * Note: this only cleans the LOCAL SQLite index. Affected users' published
 * AT Protocol records still contain the malformed tags until they re-save
 * their profile through the now-validated form. If the Jetstream subscriber
 * re-syncs a user's profile from their PDS, the malformed tags will be
 * re-inserted unless the indexer also filters at insert time.
 *
 * Owner context: Profile bounded context — operational tooling.
 */
import Database from "better-sqlite3";
import path from "path";
import { removeInvalidTags } from "../src/lib/profile/tag-cleanup";

const apply = process.argv.includes("--apply");
const DB_PATH = path.join(process.cwd(), "data", "nomare.db");

const db = new Database(DB_PATH, { readonly: !apply });

const report = removeInvalidTags(db, { apply });

db.close();

const mode = apply ? "APPLY" : "DRY-RUN";
console.log(`Mode: ${mode}`);
console.log(`Scanned ${report.scanned} tag row(s).`);

if (report.invalid.length === 0) {
  console.log("No invalid tags found.");
  process.exit(0);
}

const byDid = new Map<string, { tag: string; reason: string }[]>();
for (const item of report.invalid) {
  if (!byDid.has(item.did)) byDid.set(item.did, []);
  byDid.get(item.did)!.push({ tag: item.tag, reason: item.reason });
}

console.log(
  `Found ${report.invalid.length} invalid tag row(s) across ${byDid.size} profile(s):\n`
);

for (const [did, items] of byDid) {
  console.log(`  ${did}`);
  for (const item of items) {
    console.log(`    - ${JSON.stringify(item.tag)}  -> ${item.reason}`);
  }
}

if (apply) {
  console.log(`\nRemoved ${report.removed} row(s) from profile_tags.`);
  console.log(
    "Note: published PDS records are unchanged; affected users must re-save their profile to update their wire record."
  );
} else {
  console.log("\nDry-run only. Re-run with --apply to delete these rows.");
}

process.exit(0);
