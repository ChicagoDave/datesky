# ADR 0004 — Account Deletion: Dual-Namespace Failure Semantics

**Status:** Accepted
**Date:** 2026-05-08
**Session:** session-20260508-1749-main

## Context

ADR-0003 established that profile records are dual-published under two AT Protocol NSIDs during the rebrand transition window: `app.nomare.profile` (canonical) and `app.datesky.profile` (legacy mirror). When a user invokes "Delete my account," both records must be removed from their PDS to honor the promise on `src/app/about/page.tsx:71` ("Delete your profile from Nomare and the record disappears from your repo").

A single `com.atproto.repo.deleteRecord` call deletes one collection at one rkey. Two PDS calls are therefore required per account deletion — and either may fail independently.

### Failure modes to consider

1. **`RecordNotFound` on the legacy NSID** — expected for users who created their account *after* dual-publish launched (they only ever wrote `app.nomare.profile`). This is normal and not a failure of the user's intent.

2. **`RecordNotFound` on the canonical NSID** — possible but uncommon (e.g., a legacy-only user whose record was never re-saved post-dual-publish, or a user mid-write). Still represents a successful "the record is not there" outcome.

3. **Network / auth / PDS errors on either call** — genuine failures the user must know about so they can retry.

4. **Partial success: canonical deleted, legacy fails with non-NotFound** — the user's profile is now invisible in Nomare's read path (which prefers the canonical NSID), but a stale legacy record remains on their PDS. This violates the about page promise and silently leaves PII behind.

### Options considered

**A. Delete both; treat `RecordNotFound` on either as success; abort on any other error.**
Both deletions are attempted. `XRPCError` with `error: "RecordNotFound"` (or HTTP 404) on either call is silenced. Any other error from either call surfaces to the user as a deletion failure, and the operation is treated as failed end-to-end (the API handler returns an error; the user sees a retry path).

**B. Canonical first; if it succeeds, attempt legacy as best-effort.**
Mirrors the dual-publish *write* path from ADR-0003 §4 (where the legacy mirror write is best-effort). On legacy delete failure, log and return success. Pro: consistent with write semantics. Con: the about page promises full removal; "the legacy mirror is best-effort" is reasonable for writes (where leaving a stale legacy record harms no one) but unreasonable for deletes (where leaving a stale legacy record contradicts the user's deletion intent and leaves PII on their PDS).

**C. Canonical only; rely on the future ADR-0003 sunset to clean legacy records.**
Simplest. The legacy record persists on the user's PDS until ADR-0003's deprecation ADR fires — which has no defined timeline. Rejected: leaves PII on user PDSes for an unbounded period, contradicts the about page promise, and the deprecation sunset is for new writes, not retroactive cleanup of existing records.

## Decision

**Option A — Delete both; treat `RecordNotFound` as success; abort on any other error.**

### Implementation contract

The `deleteAccountForDid(did, agent)` helper performs both deletions sequentially:

1. **Canonical delete:** `agent.com.atproto.repo.deleteRecord({ repo: did, collection: "app.nomare.profile", rkey: "self" })`.
   - Success → continue.
   - `RecordNotFound` → continue (treat as success).
   - Any other error → abort the whole operation; surface error to caller.

2. **Legacy delete:** `agent.com.atproto.repo.deleteRecord({ repo: did, collection: "app.datesky.profile", rkey: "self" })`.
   - Success → continue.
   - `RecordNotFound` → continue (treat as success).
   - Any other error → abort the whole operation; surface error to caller.

3. Only after **both** PDS calls have completed (or been silenced as `RecordNotFound`) does the helper proceed to local-state cleanup (the belt-and-braces local delete, `oauth_sessions` cleanup, and `user_preferences` cleanup).

### Why "abort on any other error" is the right semantic

If the legacy delete fails with a network/auth/PDS error after the canonical delete succeeded, the user is in a bad state: their canonical record is gone (so Nomare cannot find them), but a legacy record persists on their PDS. The right user-facing response is "deletion failed; please retry," not "deletion succeeded with a hidden caveat." On retry, the canonical delete returns `RecordNotFound` (silenced) and the legacy delete is reattempted — the operation is naturally idempotent.

Local-state cleanup happens **only after both PDS deletions converge** to avoid the converse bad state: locally deleted but PDS records still present (which Jetstream would re-index moments later via the next `create`/`update` event the user might trigger from another client).

### `RecordNotFound` detection

The AT Protocol SDK surfaces "record not found" via `XRPCError` with one of:
- `error: "RecordNotFound"` (typed)
- HTTP status 404 (older PDS implementations)

The helper inspects both shapes. Any other error code, any non-404 HTTP status, or a thrown non-XRPC error surfaces as a real failure.

## Consequences

### Constrains

- **The dual-write semantics in ADR-0003 §4 and the dual-delete semantics here are intentionally asymmetric.** Writes treat the legacy mirror as best-effort; deletes treat it as required (modulo `RecordNotFound`). Future contributors must understand this asymmetry: a write that drops the legacy mirror harms no one, but a delete that drops the legacy mirror leaves PII on the user's PDS.

- **The deprecation ADR for ADR-0003** must continue to write the legacy mirror (and therefore must continue to support deleting it) until indexed-profile coverage of the canonical NSID is high enough to drop the fallback. When that ADR fires and the legacy write is removed, this ADR's legacy-delete step also becomes obsolete; both can be removed in the same commit.

- **Retry semantics are caller-driven, not handler-driven.** The handler does not retry on transient errors; it returns the error and the UI surfaces a retry. Rationale: retries inside the handler would conflate transient failure (worth retrying) with auth failure (which should bounce the user back to login). The UI distinguishes the two and is the right place to decide.

### Permits

- **Idempotent retries.** Because `RecordNotFound` is silenced on both calls, a user who retries after a partial failure converges to a clean state on the next attempt. No special "deletion in progress" state is needed.

- **A clean cutover when ADR-0003 sunsets.** The legacy delete step is the only thing this ADR adds beyond a single-namespace delete; removing it when legacy writes stop is a one-line change.

### Does not

- **Does not** define the API route shape, the local-state cleanup sequence, or the UI confirmation pattern. Those are scoped to the implementation phase and to ADR-0005.

- **Does not** specify retry timing, exponential backoff, or jitter. Retries are user-initiated through the UI.

- **Does not** change the dual-write path defined in ADR-0003 §4. The asymmetry is deliberate.

## Session

session-20260508-1749-main — Phase 1 of the "Delete My Account" plan (`docs/context/plan.md`). Pre-Phase Decision 1 ("Dual-namespace deletion ordering and failure semantics") is the input to this ADR; this ADR is the codification.
