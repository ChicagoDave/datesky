/**
 * Real-path test for the indexer-side tag filter inside `upsertProfile`.
 *
 * Exercises the production code path against an in-memory SQLite database
 * (no stubs, no overrides — the actual `upsertProfile` from
 * `src/lib/db/queries.ts` runs the same INSERT/DELETE statements it would
 * in production). Confirms that a Jetstream replay carrying invalid tags
 * cannot re-pollute the local `profile_tags` index after operator cleanup,
 * which was the open item left by session-20260509-0034-main.
 *
 * Run: `npx tsx scripts/test-indexer-tag-filter.ts`
 *
 * Coverage:
 *   1. Mixed valid/invalid tags — only valid rows land in profile_tags.
 *   2. All-invalid tag list — profile row persists, profile_tags has zero rows.
 *   3. All-valid tag list — every tag persists.
 *   4. Replay scenario — re-upserting with bad tags after a clean upsert does
 *      not leak invalid tags into the index (defense in depth).
 *   5. Profile fields and intentions persist normally regardless of tag filter.
 *   6. Empty/undefined tags array — no crash, no rows.
 */
import Database from "better-sqlite3";
import { initSchema } from "../src/lib/db/schema";
import {
  upsertProfile,
  browseProfiles,
  getMatchCandidates,
  getInvalidTagsForDid,
} from "../src/lib/db/queries";
import { recomputeInvalidTagFlag } from "../src/lib/profile/invalid-tag-flag";
import type { NomareProfile } from "../src/lib/atproto/lexicon";

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

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function tagsFor(db: Database.Database, did: string): string[] {
  return (
    db
      .prepare("SELECT tag FROM profile_tags WHERE did = ? ORDER BY tag")
      .all(did) as { tag: string }[]
  ).map((r) => r.tag);
}

function intentionsFor(db: Database.Database, did: string): string[] {
  return (
    db
      .prepare(
        "SELECT intention FROM profile_intentions WHERE did = ? ORDER BY intention"
      )
      .all(did) as { intention: string }[]
  ).map((r) => r.intention);
}

function profileRow(
  db: Database.Database,
  did: string
): { display_name: string | null; bio: string | null } | undefined {
  return db
    .prepare("SELECT display_name, bio FROM profiles WHERE did = ?")
    .get(did) as
    | { display_name: string | null; bio: string | null }
    | undefined;
}

function flagFor(db: Database.Database, did: string): number | undefined {
  return (
    db
      .prepare("SELECT has_invalid_tags FROM profiles WHERE did = ?")
      .get(did) as { has_invalid_tags: number } | undefined
  )?.has_invalid_tags;
}

const NOW = "2026-05-09T00:00:00.000Z";

function makeRecord(overrides: Partial<NomareProfile> = {}): NomareProfile {
  return {
    displayName: "Test User",
    bio: "hi",
    createdAt: NOW,
    ...overrides,
  };
}

// 1. Mixed valid + invalid tags — only valid rows land in profile_tags
{
  console.log("\n1. Mixed valid/invalid: only valid tags persist");
  const db = makeDb();
  const did = "did:plc:alice";
  upsertProfile(
    did,
    makeRecord({
      tags: [
        "hiking",
        "https://example.com",
        "dog-parent",
        "dog parent",
        "Hiking",
        "polyam",
      ],
    }),
    "alice.bsky.social",
    db
  );
  const tags = tagsFor(db, did);
  assert(
    JSON.stringify(tags) === JSON.stringify(["dog-parent", "hiking", "polyam"]),
    `only valid tags persist (got ${JSON.stringify(tags)})`
  );
  assert(
    !tags.includes("https://example.com"),
    "URL tag dropped"
  );
  assert(!tags.includes("dog parent"), "whitespace tag dropped");
  assert(!tags.includes("Hiking"), "uppercase tag dropped");
  db.close();
}

// 2. All-invalid tag list — profile row persists, no tag rows
{
  console.log("\n2. All-invalid: profile persists, zero tag rows");
  const db = makeDb();
  const did = "did:plc:bob";
  upsertProfile(
    did,
    makeRecord({
      tags: ["https://bad.example", "WHITESPACE TAG", "C++", "node.js"],
    }),
    "bob.bsky.social",
    db
  );
  assert(
    profileRow(db, did)?.display_name === "Test User",
    "profile row created despite all-invalid tags"
  );
  assert(tagsFor(db, did).length === 0, "no tag rows persisted");
  db.close();
}

// 3. All-valid tag list — every tag persists
{
  console.log("\n3. All-valid: every tag persists");
  const db = makeDb();
  const did = "did:plc:carol";
  upsertProfile(
    did,
    makeRecord({ tags: ["queer", "hiking", "polyam", "dog-parent"] }),
    "carol.bsky.social",
    db
  );
  assert(
    JSON.stringify(tagsFor(db, did)) ===
      JSON.stringify(["dog-parent", "hiking", "polyam", "queer"]),
    "all four valid tags persisted"
  );
  db.close();
}

// 4. Replay scenario — bad tags arriving after a clean upsert do not leak in
{
  console.log(
    "\n4. Replay: re-upsert with bad tags does not pollute the index"
  );
  const db = makeDb();
  const did = "did:plc:dave";

  // First: clean upsert with valid tags only.
  upsertProfile(
    did,
    makeRecord({ tags: ["hiking", "dog-parent"] }),
    "dave.bsky.social",
    db
  );
  assert(
    JSON.stringify(tagsFor(db, did)) ===
      JSON.stringify(["dog-parent", "hiking"]),
    "initial upsert persists valid tags"
  );

  // Then: simulate Jetstream replay of an old PDS record that still contains
  // a URL-shaped tag. The filter must drop the bad tag even though the rest
  // of the record is valid.
  upsertProfile(
    did,
    makeRecord({
      tags: ["hiking", "https://spam.example.com", "dog-parent"],
    }),
    "dave.bsky.social",
    db
  );
  const after = tagsFor(db, did);
  assert(
    JSON.stringify(after) === JSON.stringify(["dog-parent", "hiking"]),
    `replay with bad tag stays clean (got ${JSON.stringify(after)})`
  );
  assert(
    !after.includes("https://spam.example.com"),
    "URL tag rejected on replay"
  );
  db.close();
}

// 5. Profile metadata and intentions persist regardless of tag filter
{
  console.log(
    "\n5. Profile metadata + intentions persist regardless of tag filter"
  );
  const db = makeDb();
  const did = "did:plc:erin";
  upsertProfile(
    did,
    makeRecord({
      displayName: "Erin",
      bio: "biography body",
      intentions: ["dating", "friends"],
      tags: ["https://only-bad.example"],
    }),
    "erin.bsky.social",
    db
  );
  const row = profileRow(db, did);
  assert(row?.display_name === "Erin", "display_name persisted");
  assert(row?.bio === "biography body", "bio persisted");
  assert(
    JSON.stringify(intentionsFor(db, did)) ===
      JSON.stringify(["dating", "friends"]),
    "intentions persisted"
  );
  assert(
    tagsFor(db, did).length === 0,
    "no tag rows even though intentions and metadata wrote"
  );
  db.close();
}

// 6. Undefined / empty tag arrays — no crash, no rows
{
  console.log("\n6. Undefined / empty tags: no crash, no rows");
  const dbA = makeDb();
  upsertProfile(
    "did:plc:frank",
    makeRecord({ tags: undefined }),
    "frank.bsky.social",
    dbA
  );
  assert(
    tagsFor(dbA, "did:plc:frank").length === 0,
    "undefined tags array yields zero rows"
  );
  assert(flagFor(dbA, "did:plc:frank") === 0, "flag stays 0 for undefined tags");
  dbA.close();

  const dbB = makeDb();
  upsertProfile(
    "did:plc:grace",
    makeRecord({ tags: [] }),
    "grace.bsky.social",
    dbB
  );
  assert(
    tagsFor(dbB, "did:plc:grace").length === 0,
    "empty tags array yields zero rows"
  );
  assert(flagFor(dbB, "did:plc:grace") === 0, "flag stays 0 for empty tags");
  dbB.close();
}

// 7. has_invalid_tags is set to 1 when input contains any invalid tag
{
  console.log("\n7. has_invalid_tags = 1 when any input tag is invalid");
  const db = makeDb();
  upsertProfile(
    "did:plc:hank",
    makeRecord({ tags: ["hiking", "https://spam.example.com"] }),
    "hank.bsky.social",
    db
  );
  assert(flagFor(db, "did:plc:hank") === 1, "flag set when one tag is invalid");

  upsertProfile(
    "did:plc:ivy",
    makeRecord({ tags: ["dog parent", "WHITESPACE"] }),
    "ivy.bsky.social",
    db
  );
  assert(flagFor(db, "did:plc:ivy") === 1, "flag set when all tags invalid");

  upsertProfile(
    "did:plc:jules",
    makeRecord({ tags: ["hiking", "polyam"] }),
    "jules.bsky.social",
    db
  );
  assert(flagFor(db, "did:plc:jules") === 0, "flag stays 0 when all valid");
  db.close();
}

// 8. Re-saving with clean tags clears the flag
{
  console.log("\n8. Re-save with clean tags clears the flag");
  const db = makeDb();
  const did = "did:plc:kira";
  upsertProfile(
    did,
    makeRecord({ tags: ["hiking", "https://bad.example"] }),
    "kira.bsky.social",
    db
  );
  assert(flagFor(db, did) === 1, "flag set after polluted upsert");

  upsertProfile(
    did,
    makeRecord({ tags: ["hiking", "polyam"] }),
    "kira.bsky.social",
    db
  );
  assert(flagFor(db, did) === 0, "flag cleared after clean re-save");
  db.close();
}

// 9. browseProfiles excludes flagged profiles
{
  console.log("\n9. browseProfiles excludes profiles with has_invalid_tags=1");
  const db = makeDb();
  upsertProfile(
    "did:plc:liam",
    makeRecord({ displayName: "Liam", tags: ["hiking"] }),
    "liam.bsky.social",
    db
  );
  upsertProfile(
    "did:plc:mia",
    makeRecord({ displayName: "Mia", tags: ["https://bad.example"] }),
    "mia.bsky.social",
    db
  );
  upsertProfile(
    "did:plc:nora",
    makeRecord({ displayName: "Nora", tags: ["polyam"] }),
    "nora.bsky.social",
    db
  );

  const result = browseProfiles({}, db);
  const dids = result.profiles.map((p) => p.did).sort();
  assert(
    JSON.stringify(dids) ===
      JSON.stringify(["did:plc:liam", "did:plc:nora"]),
    `only clean profiles browsable (got ${JSON.stringify(dids)})`
  );
  assert(result.total === 2, `total reflects filter (got ${result.total})`);

  // After Mia re-saves cleanly, she should reappear in browse.
  upsertProfile(
    "did:plc:mia",
    makeRecord({ displayName: "Mia", tags: ["queer"] }),
    "mia.bsky.social",
    db
  );
  const after = browseProfiles({}, db);
  const afterDids = after.profiles.map((p) => p.did).sort();
  assert(
    JSON.stringify(afterDids) ===
      JSON.stringify(["did:plc:liam", "did:plc:mia", "did:plc:nora"]),
    "Mia reappears after clean re-save"
  );
  db.close();
}

// 10. getMatchCandidates excludes flagged profiles
{
  console.log(
    "\n10. getMatchCandidates excludes profiles with has_invalid_tags=1"
  );
  const db = makeDb();
  upsertProfile(
    "did:plc:viewer",
    makeRecord({ tags: ["hiking"] }),
    "viewer.bsky.social",
    db
  );
  upsertProfile(
    "did:plc:olga",
    makeRecord({ tags: ["hiking"] }),
    "olga.bsky.social",
    db
  );
  upsertProfile(
    "did:plc:pat",
    makeRecord({ tags: ["https://bad.example"] }),
    "pat.bsky.social",
    db
  );
  upsertProfile(
    "did:plc:quinn",
    makeRecord({ tags: ["polyam"] }),
    "quinn.bsky.social",
    db
  );

  const candidates = getMatchCandidates("did:plc:viewer", db);
  const dids = candidates.map((p) => p.did).sort();
  assert(
    JSON.stringify(dids) ===
      JSON.stringify(["did:plc:olga", "did:plc:quinn"]),
    `polluted Pat excluded from match (got ${JSON.stringify(dids)})`
  );
  assert(
    !dids.includes("did:plc:viewer"),
    "viewer still excluded from own candidates"
  );
  db.close();
}

// 11. getInvalidTagsForDid returns the bad tags from raw_record
{
  console.log("\n11. getInvalidTagsForDid surfaces offending tags");
  const db = makeDb();
  upsertProfile(
    "did:plc:rosa",
    makeRecord({
      tags: [
        "hiking",
        "https://bad.example.com",
        "polyam",
        "dog parent",
      ],
    }),
    "rosa.bsky.social",
    db
  );
  const bad = getInvalidTagsForDid("did:plc:rosa", db);
  assert(
    JSON.stringify(bad.sort()) ===
      JSON.stringify(["dog parent", "https://bad.example.com"]),
    `returns only invalid entries (got ${JSON.stringify(bad)})`
  );

  // Clean profile returns empty.
  upsertProfile(
    "did:plc:sam",
    makeRecord({ tags: ["hiking", "polyam"] }),
    "sam.bsky.social",
    db
  );
  assert(
    getInvalidTagsForDid("did:plc:sam", db).length === 0,
    "clean profile returns empty array"
  );

  // Unknown DID returns empty.
  assert(
    getInvalidTagsForDid("did:plc:nobody", db).length === 0,
    "unknown DID returns empty array"
  );
  db.close();
}

// 12. recomputeInvalidTagFlag dry-run reports mismatches without writing
{
  console.log("\n12. recomputeInvalidTagFlag dry-run is read-only");
  const db = makeDb();
  // Upsert a polluted record, then manually clobber the flag to 0 to simulate
  // an existing row from before the column existed.
  upsertProfile(
    "did:plc:tom",
    makeRecord({ tags: ["hiking", "https://bad.example"] }),
    "tom.bsky.social",
    db
  );
  db.prepare("UPDATE profiles SET has_invalid_tags = 0 WHERE did = ?").run(
    "did:plc:tom"
  );
  assert(
    flagFor(db, "did:plc:tom") === 0,
    "pre-condition: flag forced to 0 to simulate legacy row"
  );

  const result = recomputeInvalidTagFlag(db, { apply: false });
  assert(result.scanned === 1, "scanned 1");
  assert(result.mismatches.length === 1, "one mismatch reported");
  assert(
    result.mismatches[0].did === "did:plc:tom" &&
      result.mismatches[0].was === 0 &&
      result.mismatches[0].now === 1,
    "mismatch describes 0 -> 1 transition"
  );
  assert(result.updated === 0, "dry-run updates zero rows");
  assert(result.apply === false, "apply flag echoed back as false");
  assert(
    flagFor(db, "did:plc:tom") === 0,
    "row still 0 after dry-run (no write)"
  );
  db.close();
}

// 13. recomputeInvalidTagFlag --apply writes the updated flags
{
  console.log("\n13. recomputeInvalidTagFlag --apply writes updates");
  const db = makeDb();
  // Seed three rows: one polluted (flag forced 0), one clean (flag forced 1
  // as a stale-mismatch in the other direction), one already correct.
  upsertProfile(
    "did:plc:una",
    makeRecord({ tags: ["hiking", "https://bad.example"] }),
    "una.bsky.social",
    db
  );
  upsertProfile(
    "did:plc:vic",
    makeRecord({ tags: ["polyam"] }),
    "vic.bsky.social",
    db
  );
  upsertProfile(
    "did:plc:wes",
    makeRecord({ tags: ["queer"] }),
    "wes.bsky.social",
    db
  );
  db.prepare("UPDATE profiles SET has_invalid_tags = 0 WHERE did = ?").run(
    "did:plc:una"
  );
  db.prepare("UPDATE profiles SET has_invalid_tags = 1 WHERE did = ?").run(
    "did:plc:vic"
  );

  const result = recomputeInvalidTagFlag(db, { apply: true });
  assert(result.scanned === 3, "scanned 3");
  assert(result.mismatches.length === 2, "two mismatches reported");
  assert(result.updated === 2, "applied two updates");

  assert(
    flagFor(db, "did:plc:una") === 1,
    "Una's row now flagged (polluted record detected)"
  );
  assert(
    flagFor(db, "did:plc:vic") === 0,
    "Vic's row now clear (clean record detected, stale flag lifted)"
  );
  assert(
    flagFor(db, "did:plc:wes") === 0,
    "Wes's already-correct row untouched"
  );
  db.close();
}

// 14. recomputeInvalidTagFlag --apply is idempotent
{
  console.log("\n14. recomputeInvalidTagFlag --apply is idempotent");
  const db = makeDb();
  upsertProfile(
    "did:plc:xan",
    makeRecord({ tags: ["hiking", "https://bad.example"] }),
    "xan.bsky.social",
    db
  );
  db.prepare("UPDATE profiles SET has_invalid_tags = 0 WHERE did = ?").run(
    "did:plc:xan"
  );

  const r1 = recomputeInvalidTagFlag(db, { apply: true });
  assert(r1.updated === 1, "first apply writes 1 row");

  const r2 = recomputeInvalidTagFlag(db, { apply: true });
  assert(r2.scanned === 1, "second apply scans 1");
  assert(r2.mismatches.length === 0, "second apply finds zero mismatches");
  assert(r2.updated === 0, "second apply writes zero rows");
  db.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
