/**
 * Account deletion orchestrator for Nomare.
 *
 * Public interface: `deleteAccountForDid(did, agent, db?)` — removes both the
 * canonical and legacy profile records from the user's PDS, then cleans up all
 * server-side state for that DID (local index row, user preferences, OAuth session).
 *
 * Owner: Profile + Identity/Auth bounded contexts. Composite operation.
 *
 * Failure semantics: per ADR-0004 — `RecordNotFound` (HTTP 400/404) on either
 * PDS deleteRecord call is silenced as success. Any other PDS error aborts the
 * operation BEFORE local-state mutation, so a retry can converge cleanly. Local
 * cleanup runs only after both PDS deletions have converged.
 *
 * Per ADR-0006: this is a hard delete with no grace window. There is no `deleted_at`
 * marker; rows are physically removed.
 *
 * The Jetstream subscriber (`scripts/jetstream.ts`) also handles ATProto delete
 * events asynchronously and removes the user from the moderation list. The
 * synchronous local cleanup here is a belt-and-braces measure (Decision 2 in
 * `docs/context/plan.md`); duplicate deletes are idempotent no-ops.
 */
import type { Agent } from "@atproto/api";
import type Database from "better-sqlite3";
import { COLLECTION, LEGACY_COLLECTION, RKEY } from "./lexicon";
import { getDb } from "../db/index";
import {
  deleteProfile,
  deleteUserPreferences,
  deleteOAuthSession,
} from "../db/queries";

/**
 * True when the PDS error represents "this record does not exist." The AT
 * Protocol SDK surfaces this as HTTP 400 or 404 with the XRPC error string
 * `RecordNotFound`. We accept either signal — the existing read path in
 * `src/app/api/profile/route.ts` uses the same idiom.
 */
function isRecordNotFound(err: unknown): boolean {
  const e = err as { status?: number; error?: string };
  if (e?.status === 400 || e?.status === 404) return true;
  if (e?.error === "RecordNotFound") return true;
  return false;
}

/**
 * Deletes the user's account end-to-end. On success, both PDS profile records
 * have been removed (or were already absent) and all server-side state for the
 * DID has been cleaned. On PDS failure (other than RecordNotFound), throws
 * before any local mutation; the caller is responsible for surfacing the error
 * and the user may retry. The retry converges because RecordNotFound is silenced.
 *
 * @param did   The user's DID. Must be the DID of the active session.
 * @param agent An authenticated AT Protocol agent for `did` (obtained via `getAgent(did)`).
 * @param db    Optional database handle. Defaults to the process singleton.
 *              Tests pass an isolated handle.
 * @throws The original PDS error if either deleteRecord call fails with a
 *         non-RecordNotFound error. No local state has been mutated when this throws.
 */
export async function deleteAccountForDid(
  did: string,
  agent: Agent,
  db: Database.Database = getDb()
): Promise<void> {
  if (!did) {
    throw new Error("deleteAccountForDid: did is required");
  }

  // PDS deletes first. Either may legitimately return RecordNotFound (a user who
  // joined post-dual-publish has no legacy record; a legacy-only user whose
  // record was never re-saved has no canonical record). Other errors abort.
  // ADR-0004.
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: COLLECTION,
      rkey: RKEY,
    });
  } catch (err) {
    if (!isRecordNotFound(err)) throw err;
  }

  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: LEGACY_COLLECTION,
      rkey: RKEY,
    });
  } catch (err) {
    if (!isRecordNotFound(err)) throw err;
  }

  // Local cleanup. Only reached when both PDS calls converged. Order does not
  // matter — each statement is independent. profile_tags and profile_intentions
  // cascade via FK from the profiles delete (schema.ts).
  deleteProfile(did, db);
  deleteUserPreferences(did, db);
  deleteOAuthSession(did, db);
}
