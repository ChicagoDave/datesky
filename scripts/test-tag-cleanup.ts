/**
 * Real-path test for `removeInvalidTags`. Uses an in-memory SQLite DB so the
 * test exercises the production code path with no stubs.
 *
 * Run: `npx tsx scripts/test-tag-cleanup.ts`
 */
import Database from "better-sqlite3";
import { removeInvalidTags } from "../src/lib/profile/tag-cleanup";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE profile_tags (
      did TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (did, tag)
    );
  `);
  return db;
}

function rowCount(db: Database.Database): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM profile_tags").get() as { n: number }
  ).n;
}

function tagsFor(db: Database.Database, did: string): string[] {
  return (
    db
      .prepare("SELECT tag FROM profile_tags WHERE did = ? ORDER BY tag")
      .all(did) as { tag: string }[]
  ).map((r) => r.tag);
}

// 1. Empty table: scanned 0, invalid 0, removed 0
{
  console.log("\n1. Empty table is a no-op");
  const db = makeDb();
  const r = removeInvalidTags(db, { apply: true });
  assert(r.scanned === 0, "scanned 0");
  assert(r.invalid.length === 0, "invalid empty");
  assert(r.removed === 0, "removed 0");
  db.close();
}

// 2. All-valid table: scanned > 0, invalid 0, no rows touched
{
  console.log("\n2. All-valid table preserves every row");
  const db = makeDb();
  db.prepare("INSERT INTO profile_tags (did, tag) VALUES (?, ?)").run(
    "did:plc:alice",
    "hiking"
  );
  db.prepare("INSERT INTO profile_tags (did, tag) VALUES (?, ?)").run(
    "did:plc:alice",
    "dog-parent"
  );
  db.prepare("INSERT INTO profile_tags (did, tag) VALUES (?, ?)").run(
    "did:plc:bob",
    "polyam"
  );
  const r = removeInvalidTags(db, { apply: true });
  assert(r.scanned === 3, "scanned 3");
  assert(r.invalid.length === 0, "invalid empty");
  assert(r.removed === 0, "removed 0");
  assert(rowCount(db) === 3, "all rows still present");
  db.close();
}

// 3. Dry-run reports invalid but mutates nothing
{
  console.log("\n3. Dry-run reports invalid but does not delete");
  const db = makeDb();
  const insert = db.prepare(
    "INSERT INTO profile_tags (did, tag) VALUES (?, ?)"
  );
  insert.run("did:plc:alice", "hiking");
  insert.run("did:plc:alice", "https://example.com");
  insert.run("did:plc:bob", "dog parent");
  insert.run("did:plc:bob", "polyam");
  const r = removeInvalidTags(db, { apply: false });
  assert(r.scanned === 4, "scanned 4");
  assert(r.invalid.length === 2, "invalid 2");
  assert(r.removed === 0, "removed 0 in dry-run");
  assert(r.apply === false, "apply flag echoed back as false");
  assert(rowCount(db) === 4, "all rows still present after dry-run");
  const aliceTags = tagsFor(db, "did:plc:alice");
  assert(
    aliceTags.includes("https://example.com") && aliceTags.includes("hiking"),
    "alice's bad tag still present after dry-run"
  );
  db.close();
}

// 4. --apply removes only invalid rows; valid rows survive
{
  console.log("\n4. apply removes invalid rows; valid rows untouched");
  const db = makeDb();
  const insert = db.prepare(
    "INSERT INTO profile_tags (did, tag) VALUES (?, ?)"
  );
  insert.run("did:plc:alice", "hiking");
  insert.run("did:plc:alice", "https://example.com");
  insert.run("did:plc:alice", "dog-parent");
  insert.run("did:plc:bob", "dog parent");
  insert.run("did:plc:bob", "polyam");
  insert.run("did:plc:carol", "Hiking"); // uppercase — invalid
  insert.run("did:plc:carol", "queer");

  const r = removeInvalidTags(db, { apply: true });
  assert(r.scanned === 7, "scanned 7");
  assert(r.invalid.length === 3, "invalid 3");
  assert(r.removed === 3, "removed 3");

  assert(rowCount(db) === 4, "4 valid rows remain");
  assert(
    JSON.stringify(tagsFor(db, "did:plc:alice")) ===
      JSON.stringify(["dog-parent", "hiking"]),
    "alice keeps only valid tags"
  );
  assert(
    JSON.stringify(tagsFor(db, "did:plc:bob")) === JSON.stringify(["polyam"]),
    "bob keeps only valid tag"
  );
  assert(
    JSON.stringify(tagsFor(db, "did:plc:carol")) === JSON.stringify(["queer"]),
    "carol keeps only valid tag"
  );
  db.close();
}

// 5. Idempotent: running --apply twice is safe
{
  console.log("\n5. apply is idempotent");
  const db = makeDb();
  const insert = db.prepare(
    "INSERT INTO profile_tags (did, tag) VALUES (?, ?)"
  );
  insert.run("did:plc:alice", "hiking");
  insert.run("did:plc:alice", "https://example.com");

  const r1 = removeInvalidTags(db, { apply: true });
  assert(r1.removed === 1, "first pass removes 1");
  assert(rowCount(db) === 1, "1 row remains after first pass");

  const r2 = removeInvalidTags(db, { apply: true });
  assert(r2.scanned === 1, "second pass scans 1");
  assert(r2.invalid.length === 0, "second pass finds no invalid");
  assert(r2.removed === 0, "second pass removes 0");
  assert(rowCount(db) === 1, "row count stable on second pass");
  db.close();
}

// 6. Independence — cleaning bad tags of one DID does not affect others
{
  console.log("\n6. cross-DID independence");
  const db = makeDb();
  const insert = db.prepare(
    "INSERT INTO profile_tags (did, tag) VALUES (?, ?)"
  );
  insert.run("did:plc:alice", "https://example.com");
  insert.run("did:plc:bob", "hiking");
  insert.run("did:plc:bob", "polyam");

  removeInvalidTags(db, { apply: true });
  assert(tagsFor(db, "did:plc:alice").length === 0, "alice fully cleaned");
  assert(
    JSON.stringify(tagsFor(db, "did:plc:bob")) ===
      JSON.stringify(["hiking", "polyam"]),
    "bob untouched"
  );
  db.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
