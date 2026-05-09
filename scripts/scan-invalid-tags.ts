/**
 * Read-only scan of the local profile_tags index for tags that fail the new
 * `isValidProfileTag` rule. Prints a grouped report (DID + offending tag +
 * reason) and exits 0. No mutations.
 *
 * Run: `npx tsx scripts/scan-invalid-tags.ts`
 *
 * Owner context: Profile bounded context — operational tooling for surfacing
 * pre-existing pollution before/after rolling out the validator.
 */
import Database from "better-sqlite3";
import path from "path";
import { isValidProfileTag } from "../src/lib/profile/tag-validation";

const DB_PATH = path.join(process.cwd(), "data", "nomare.db");

const db = new Database(DB_PATH, { readonly: true });

type Row = { did: string; tag: string };

const rows = db.prepare("SELECT did, tag FROM profile_tags").all() as Row[];

const offenders = new Map<string, { tag: string; reason: string }[]>();
let totalRows = 0;
let badRows = 0;

for (const row of rows) {
  totalRows++;
  const result = isValidProfileTag(row.tag);
  if (!result.ok) {
    badRows++;
    if (!offenders.has(row.did)) offenders.set(row.did, []);
    offenders.get(row.did)!.push({ tag: row.tag, reason: result.reason });
  }
}

db.close();

console.log(`Scanned ${totalRows} tag row(s) across ${new Set(rows.map((r) => r.did)).size} profile(s).`);

if (badRows === 0) {
  console.log("No invalid tags found.");
  process.exit(0);
}

console.log(`Found ${badRows} invalid tag row(s) across ${offenders.size} profile(s):\n`);

for (const [did, items] of offenders) {
  console.log(`  ${did}`);
  for (const item of items) {
    console.log(`    - ${JSON.stringify(item.tag)}  -> ${item.reason}`);
  }
}

process.exit(0);
