/**
 * Real-path test for the account deletion helper (`deleteAccountForDid`).
 *
 * Exercises the actual SQLite path defined in `src/lib/db/schema.ts` against a
 * temporary database file. The PDS agent is stubbed (the user's PDS is external
 * per CLAUDE.md rule 12a's classification; the operator-run dual-publish test
 * at `scripts/test-dual-publish.ts` covers the real PDS deleteRecord round-trip
 * for the lexicon-namespace contract).
 *
 * USAGE:
 *
 *   npx tsx scripts/test-account-deletion.ts
 *
 * Exit code 0 means all assertions passed. Non-zero indicates a regression in
 * the deletion contract — investigate before merging.
 *
 * Coverage (from ADR-0004 + Behavior Statement in session-20260508-1749-main):
 *
 *   1. Happy path: both PDS deletes succeed → all 5 row-class targets cleaned.
 *   2. RecordNotFound on canonical only → legacy is still attempted, local cleaned.
 *   3. RecordNotFound on legacy only → canonical succeeded, local cleaned.
 *   4. RecordNotFound on both → local cleaned (idempotent retry case).
 *   5. Non-NotFound error on canonical → throws, local untouched.
 *   6. Non-NotFound error on legacy (after canonical succeeded) → throws, local untouched.
 *   7. Empty DID → throws synchronously, no PDS calls, no local mutation.
 *   8. CASCADE check: profile_tags and profile_intentions are removed via FK cascade
 *      when the profiles row is deleted.
 *   9. Independence check: only the target DID is affected; sibling rows untouched.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { initSchema } from "../src/lib/db/schema";
import { deleteAccountForDid } from "../src/lib/atproto/account-deletion";

type DeleteCall = { collection: string; rkey: string; repo: string };

interface FakeAgentOptions {
  failCanonicalWith?: unknown;
  failLegacyWith?: unknown;
}

/**
 * Builds a stub Agent whose `com.atproto.repo.deleteRecord` records calls and
 * optionally throws per the configured options. Mirrors the shape used by the
 * helper; only the methods touched are populated.
 */
function buildFakeAgent(opts: FakeAgentOptions = {}) {
  const calls: DeleteCall[] = [];
  const agent = {
    com: {
      atproto: {
        repo: {
          deleteRecord: async (input: {
            repo: string;
            collection: string;
            rkey: string;
          }) => {
            calls.push({
              repo: input.repo,
              collection: input.collection,
              rkey: input.rkey,
            });
            if (
              input.collection === "app.nomare.profile" &&
              opts.failCanonicalWith !== undefined
            ) {
              throw opts.failCanonicalWith;
            }
            if (
              input.collection === "app.datesky.profile" &&
              opts.failLegacyWith !== undefined
            ) {
              throw opts.failLegacyWith;
            }
            return { success: true };
          },
        },
      },
    },
  };
  // The helper accepts `Agent` from @atproto/api; `unknown` cast is the test's
  // explicit acknowledgment that this is a structural stand-in for the surface
  // it actually touches (deleteRecord only).
  return { agent: agent as unknown as Parameters<typeof deleteAccountForDid>[1], calls };
}

function freshDb(): { db: Database.Database; tmpFile: string } {
  const tmpFile = path.join(
    os.tmpdir(),
    `nomare-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  const db = new Database(tmpFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return { db, tmpFile };
}

function cleanupDb(db: Database.Database, tmpFile: string) {
  db.close();
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    // ignore
  }
  for (const ext of ["-wal", "-shm"]) {
    try {
      fs.unlinkSync(tmpFile + ext);
    } catch {
      // ignore
    }
  }
}

function seedFixture(
  db: Database.Database,
  did: string,
  opts: { tags?: string[]; intentions?: string[]; withPrefs?: boolean; withSession?: boolean }
) {
  db.prepare(
    `INSERT INTO profiles (did, handle, display_name, indexed_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(did, `${did.replace(/[^a-z0-9]/gi, "")}.bsky.social`, "Fixture User");

  for (const tag of opts.tags ?? []) {
    db.prepare("INSERT INTO profile_tags (did, tag) VALUES (?, ?)").run(did, tag);
  }
  for (const intention of opts.intentions ?? []) {
    db.prepare(
      "INSERT INTO profile_intentions (did, intention) VALUES (?, ?)"
    ).run(did, intention);
  }
  if (opts.withPrefs) {
    db.prepare(
      `INSERT INTO user_preferences (
         did, show_photos, compact_view, match_mode_enabled, match_intent,
         dating_age_min, dating_age_max, friendship_age_min, friendship_age_max,
         gender_preferences, location_filter, updated_at
       )
       VALUES (?, 1, 0, 1, 'dating', 25, 45, 18, 99, '[]', NULL, datetime('now'))`
    ).run(did);
  }
  if (opts.withSession) {
    db.prepare(
      "INSERT INTO oauth_sessions (did, session, updated_at) VALUES (?, ?, datetime('now'))"
    ).run(did, JSON.stringify({ stub: "session-payload" }));
  }
}

function rowCounts(db: Database.Database, did: string) {
  const get = (sql: string) =>
    (db.prepare(sql).get(did) as { c: number }).c;
  return {
    profiles: get("SELECT COUNT(*) as c FROM profiles WHERE did = ?"),
    tags: get("SELECT COUNT(*) as c FROM profile_tags WHERE did = ?"),
    intentions: get(
      "SELECT COUNT(*) as c FROM profile_intentions WHERE did = ?"
    ),
    prefs: get(
      "SELECT COUNT(*) as c FROM user_preferences WHERE did = ?"
    ),
    sessions: get(
      "SELECT COUNT(*) as c FROM oauth_sessions WHERE did = ?"
    ),
  };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL  ${label}`);
  }
}

function describe(name: string, fn: () => Promise<void> | void) {
  console.log(`\n${name}`);
  return fn();
}

async function main() {
  const did = "did:plc:test123abc";
  const otherDid = "did:plc:other456xyz";

  await describe("1. Happy path: both PDS deletes succeed → all local state cleaned", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, {
      tags: ["music", "books"],
      intentions: ["dating", "friendship"],
      withPrefs: true,
      withSession: true,
    });
    const before = rowCounts(db, did);
    assert(before.profiles === 1, "fixture: profile seeded");
    assert(before.tags === 2, "fixture: tags seeded");
    assert(before.intentions === 2, "fixture: intentions seeded");
    assert(before.prefs === 1, "fixture: preferences seeded");
    assert(before.sessions === 1, "fixture: oauth session seeded");

    const { agent, calls } = buildFakeAgent();
    await deleteAccountForDid(did, agent, db);

    const after = rowCounts(db, did);
    assert(after.profiles === 0, "after: profiles row removed");
    assert(after.tags === 0, "after: profile_tags cascaded");
    assert(after.intentions === 0, "after: profile_intentions cascaded");
    assert(after.prefs === 0, "after: user_preferences row removed");
    assert(after.sessions === 0, "after: oauth_sessions row removed");

    assert(calls.length === 2, "PDS: exactly 2 deleteRecord calls");
    assert(
      calls[0].collection === "app.nomare.profile" && calls[0].rkey === "self",
      "PDS: first call is canonical/self"
    );
    assert(
      calls[1].collection === "app.datesky.profile" && calls[1].rkey === "self",
      "PDS: second call is legacy/self"
    );
    assert(calls[0].repo === did && calls[1].repo === did, "PDS: both calls target the user's DID");

    cleanupDb(db, tmpFile);
  });

  await describe("2. RecordNotFound on canonical → legacy still attempted, local cleaned", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, { withPrefs: true, withSession: true });

    const notFound = Object.assign(new Error("RecordNotFound"), {
      status: 400,
      error: "RecordNotFound",
    });
    const { agent, calls } = buildFakeAgent({ failCanonicalWith: notFound });
    await deleteAccountForDid(did, agent, db);

    assert(calls.length === 2, "PDS: legacy still attempted after canonical NotFound");
    const after = rowCounts(db, did);
    assert(after.profiles === 0 && after.prefs === 0 && after.sessions === 0, "local: cleaned");
    cleanupDb(db, tmpFile);
  });

  await describe("3. RecordNotFound on legacy only → both attempted, local cleaned", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, { withPrefs: true, withSession: true });

    const notFound404 = Object.assign(new Error("not found"), { status: 404 });
    const { agent, calls } = buildFakeAgent({ failLegacyWith: notFound404 });
    await deleteAccountForDid(did, agent, db);

    assert(calls.length === 2, "PDS: both calls fired");
    const after = rowCounts(db, did);
    assert(after.profiles === 0 && after.prefs === 0 && after.sessions === 0, "local: cleaned");
    cleanupDb(db, tmpFile);
  });

  await describe("4. RecordNotFound on both → idempotent retry case, local cleaned", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, { withPrefs: true, withSession: true });

    const nf = Object.assign(new Error("not found"), { status: 404 });
    const { agent } = buildFakeAgent({ failCanonicalWith: nf, failLegacyWith: nf });
    await deleteAccountForDid(did, agent, db);

    const after = rowCounts(db, did);
    assert(after.profiles === 0 && after.prefs === 0 && after.sessions === 0, "local: cleaned");
    cleanupDb(db, tmpFile);
  });

  await describe("5. Non-NotFound error on canonical → throws, NO local mutation", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, {
      tags: ["music"],
      intentions: ["dating"],
      withPrefs: true,
      withSession: true,
    });

    const realErr = Object.assign(new Error("Network unreachable"), {
      status: 503,
    });
    const { agent, calls } = buildFakeAgent({ failCanonicalWith: realErr });

    let threw = false;
    try {
      await deleteAccountForDid(did, agent, db);
    } catch (e) {
      threw = true;
      assert(e === realErr, "thrown: original error preserved");
    }
    assert(threw, "helper threw on non-NotFound canonical error");

    assert(calls.length === 1, "PDS: legacy NOT attempted after canonical real error");
    const after = rowCounts(db, did);
    assert(after.profiles === 1, "local: profiles row preserved");
    assert(after.tags === 1, "local: tags preserved");
    assert(after.intentions === 1, "local: intentions preserved");
    assert(after.prefs === 1, "local: preferences preserved");
    assert(after.sessions === 1, "local: oauth session preserved");
    cleanupDb(db, tmpFile);
  });

  await describe("6. Non-NotFound error on legacy (after canonical OK) → throws, NO local mutation", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, { withPrefs: true, withSession: true });

    const realErr = Object.assign(new Error("Auth expired"), { status: 401 });
    const { agent, calls } = buildFakeAgent({ failLegacyWith: realErr });

    let threw = false;
    try {
      await deleteAccountForDid(did, agent, db);
    } catch (e) {
      threw = true;
      assert(e === realErr, "thrown: original error preserved");
    }
    assert(threw, "helper threw on non-NotFound legacy error");
    assert(calls.length === 2, "PDS: both calls were attempted");

    const after = rowCounts(db, did);
    assert(after.profiles === 1, "local: profiles row preserved (canonical succeeded but legacy failed)");
    assert(after.prefs === 1, "local: preferences preserved");
    assert(after.sessions === 1, "local: oauth session preserved");
    cleanupDb(db, tmpFile);
  });

  await describe("7. Empty DID → throws synchronously, no PDS, no local mutation", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, { withPrefs: true, withSession: true });
    const { agent, calls } = buildFakeAgent();

    let threw = false;
    try {
      await deleteAccountForDid("", agent, db);
    } catch {
      threw = true;
    }
    assert(threw, "empty DID throws");
    assert(calls.length === 0, "no PDS calls");
    const after = rowCounts(db, did);
    assert(after.profiles === 1 && after.prefs === 1 && after.sessions === 1, "local: untouched");
    cleanupDb(db, tmpFile);
  });

  await describe("8. Independence: only target DID affected", async () => {
    const { db, tmpFile } = freshDb();
    seedFixture(db, did, {
      tags: ["a"],
      intentions: ["dating"],
      withPrefs: true,
      withSession: true,
    });
    seedFixture(db, otherDid, {
      tags: ["b"],
      intentions: ["friendship"],
      withPrefs: true,
      withSession: true,
    });

    const { agent } = buildFakeAgent();
    await deleteAccountForDid(did, agent, db);

    const target = rowCounts(db, did);
    const sibling = rowCounts(db, otherDid);
    assert(
      target.profiles === 0 && target.tags === 0 && target.intentions === 0 &&
        target.prefs === 0 && target.sessions === 0,
      "target DID: fully cleaned"
    );
    assert(
      sibling.profiles === 1 && sibling.tags === 1 && sibling.intentions === 1 &&
        sibling.prefs === 1 && sibling.sessions === 1,
      "sibling DID: fully preserved"
    );
    cleanupDb(db, tmpFile);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFAILED ASSERTIONS:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test harness error:", err);
  process.exit(2);
});
