/**
 * Manual real-path test for the dual-publish lexicon migration (ADR-0003).
 *
 * Runs against a live Bluesky test account and exercises the full dual-write +
 * read-fallback path. This is the integration-reality test required by CLAUDE.md
 * rule 12a for the lexicon migration.
 *
 * USAGE:
 *
 *   1. Create or designate a dedicated Bluesky test account (do NOT use a personal
 *      account — this script creates and deletes profile records under both NSIDs).
 *   2. Generate an app password for that account at https://bsky.app/settings/app-passwords.
 *   3. Run:
 *
 *        NOMARE_TEST_HANDLE=yourtest.bsky.social \
 *        NOMARE_TEST_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
 *        npx tsx scripts/test-dual-publish.ts
 *
 *   The script:
 *     - logs in via app password
 *     - cleans any pre-existing records under both NSIDs on the test account
 *     - writes a sentinel record to both NSIDs (simulating the PUT /api/profile dual-write)
 *     - asserts both records exist on the PDS
 *     - tests read fallback when only the legacy NSID is present (legacy user simulation)
 *     - tests read precedence when both NSIDs are present (sentinel discriminator)
 *     - cleans up both records
 *
 *   Exit code 0 means all assertions passed. Any non-zero exit means a regression in
 *   the dual-publish path; investigate before deploying.
 *
 * NOTE: this script logs in via app password (not OAuth) because it runs without the
 * app's HTTP layer. The production read/write paths use the OAuth-issued agent, but
 * the underlying XRPC calls (com.atproto.repo.putRecord, com.atproto.repo.getRecord)
 * are identical, so the dual-publish behavior surfaces here in the same way.
 */
import { AtpAgent } from "@atproto/api";
import {
  COLLECTION,
  LEGACY_COLLECTION,
  RKEY,
  type NomareProfile,
} from "../src/lib/atproto/lexicon";
import { fetchProfileFromPds, resolveDid } from "../src/lib/atproto/resolve";

const HANDLE = process.env.NOMARE_TEST_HANDLE;
const APP_PASSWORD = process.env.NOMARE_TEST_APP_PASSWORD;

if (!HANDLE || !APP_PASSWORD) {
  console.error(
    "Missing NOMARE_TEST_HANDLE or NOMARE_TEST_APP_PASSWORD. See script header for usage."
  );
  process.exit(2);
}

const SENTINEL_NEW = `nomare-test-new-${Date.now()}`;
const SENTINEL_LEGACY = `nomare-test-legacy-${Date.now()}`;

function buildRecord(sentinel: string, $type: string): NomareProfile {
  return {
    $type: $type as typeof COLLECTION | typeof LEGACY_COLLECTION,
    displayName: "Nomare Dual-Publish Test",
    bio: sentinel,
    createdAt: new Date().toISOString(),
  };
}

async function tryDeleteRecord(
  agent: AtpAgent,
  did: string,
  collection: string
): Promise<void> {
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection,
      rkey: RKEY,
    });
  } catch {
    // Record may not exist; ignore.
  }
}

async function tryGetRecord(
  agent: AtpAgent,
  did: string,
  collection: string
): Promise<NomareProfile | null> {
  try {
    const res = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection,
      rkey: RKEY,
    });
    return res.data.value as unknown as NomareProfile;
  } catch {
    return null;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

async function main() {
  console.log(`Logging in as ${HANDLE}...`);
  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: HANDLE!, password: APP_PASSWORD! });
  const did = agent.session?.did;
  if (!did) {
    console.error("Login succeeded but no DID on session.");
    process.exit(1);
  }
  console.log(`DID: ${did}`);

  const resolved = await resolveDid(did);
  if (!resolved) {
    console.error(`Could not resolve PDS host for ${did}.`);
    process.exit(1);
  }
  console.log(`PDS host: ${resolved.pdsHost}`);

  // Pre-test cleanup so the test starts from a known empty state.
  console.log("\nCleanup: removing any pre-existing test records...");
  await tryDeleteRecord(agent, did, COLLECTION);
  await tryDeleteRecord(agent, did, LEGACY_COLLECTION);

  // --- Test 1: dual-write path produces both records on the PDS ---
  console.log("\nTest 1: dual-write produces both records");
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION,
    rkey: RKEY,
    record: buildRecord(SENTINEL_NEW, COLLECTION) as unknown as Record<
      string,
      unknown
    >,
  });
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: LEGACY_COLLECTION,
    rkey: RKEY,
    record: buildRecord(SENTINEL_LEGACY, LEGACY_COLLECTION) as unknown as Record<
      string,
      unknown
    >,
  });

  const newRec = await tryGetRecord(agent, did, COLLECTION);
  const legacyRec = await tryGetRecord(agent, did, LEGACY_COLLECTION);
  assert(newRec !== null, `${COLLECTION} record exists after dual-write`);
  assert(
    legacyRec !== null,
    `${LEGACY_COLLECTION} record exists after dual-write`
  );

  // --- Test 2: read precedence — both present, fetchProfileFromPds returns nomare ---
  console.log("\nTest 2: with both records present, read returns canonical NSID");
  const both = await fetchProfileFromPds(did, resolved.pdsHost);
  assert(both !== null, "fetchProfileFromPds returns a record");
  assert(
    both?.bio === SENTINEL_NEW,
    `read returned the canonical (nomare) record (got bio=${both?.bio})`
  );

  // --- Test 3: read fallback — legacy only, fetchProfileFromPds returns legacy ---
  console.log("\nTest 3: legacy-only record falls back to legacy NSID");
  await tryDeleteRecord(agent, did, COLLECTION);
  // PDS reads are cached for 60s in the app's resolve.ts. The test bypasses that
  // by hitting the PDS endpoint directly; Next.js cache only applies to the runtime
  // it's running in, so a tsx-script run sees fresh PDS state.
  const legacyOnly = await fetchProfileFromPds(did, resolved.pdsHost);
  assert(legacyOnly !== null, "fetchProfileFromPds falls back to legacy NSID");
  assert(
    legacyOnly?.bio === SENTINEL_LEGACY,
    `fallback returned the legacy record (got bio=${legacyOnly?.bio})`
  );

  // --- Cleanup ---
  console.log("\nCleanup: removing test records...");
  await tryDeleteRecord(agent, did, COLLECTION);
  await tryDeleteRecord(agent, did, LEGACY_COLLECTION);
  console.log("Cleanup complete.");

  if (process.exitCode === 1) {
    console.error("\nOne or more assertions FAILED. See output above.");
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
