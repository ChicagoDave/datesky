# ADR 0006 — Hard Delete (No Soft-Delete or Grace Period) for v1

**Status:** Accepted
**Date:** 2026-05-08
**Session:** session-20260508-1749-main

## Context

When a user invokes "Delete my account," the system must decide between two recovery models:

1. **Hard delete:** the action is irreversible from the user's perspective. PDS records and local state are removed immediately on confirmation.
2. **Soft delete:** the action is reversible for some grace window (24h, 72h, 30d). Local state is marked `deleted_at` rather than physically removed; PDS deletion is either deferred to a scheduled job or executed immediately. A support process or a self-service "recover" path exists during the window.

The choice affects schema, scheduled-job infrastructure, browse-path filtering, the ATProto delete propagation contract, and — crucially — the truthfulness of the existing about-page copy at `src/app/about/page.tsx:71`: *"Delete your profile from Nomare and the record disappears from your repo."*

### Options considered

**A. Immediate hard delete (v1).**
On confirmation, the API handler:
1. Deletes both PDS records (per ADR-0004).
2. Calls `deleteProfile(did)` against the local SQLite index (CASCADE handles `profile_tags` and `profile_intentions`).
3. Explicitly deletes the `user_preferences` and `oauth_sessions` rows.
4. Destroys the session cookie and redirects.

No new schema. No scheduled job. No browse filter changes (deleted rows are gone, so they don't surface). The about-page copy is honored verbatim.

**B. Soft delete with grace window.**
On confirmation, the row is marked `deleted_at = now()`. Local browse paths must filter `WHERE deleted_at IS NULL`. The PDS delete is either deferred (requires re-authenticating later — impossible because the user is logged out) or executed immediately (in which case the "soft delete" is one-sided: the PDS record is gone but the local row is preserved). A scheduled job (cron, queue worker, or app-startup sweep) hard-deletes rows past the grace window. A "recover" path requires a way to identify the user without an active session — typically by re-OAuth, which itself reconstructs the local state via Jetstream replay, defeating the grace-period purpose.

The complexity multiplies for a feature whose user-facing benefit is small in a small community: accidental deletions are rare (especially with the typed-`DELETE` confirmation in ADR-0005), and the about-page copy would have to be changed to say "your account will be deleted within 72 hours" — weakening a clear promise.

**C. Hybrid: hard delete on PDS, soft delete locally.**
Local `deleted_at` flag, immediate PDS deletion. Allows a "recover within 72h" UX that re-creates PDS records from the preserved local row. Rejected: re-creating PDS records on the user's behalf without an active OAuth session is **not possible** in AT Protocol — the user must be logged in for any record write. The grace window is therefore a fiction; the user could log back in via OAuth, but at that point Jetstream re-indexes whatever they write fresh anyway.

## Decision

**Option A — Immediate hard delete for v1.**

### Implementation contract

The `deleteAccountForDid(did, agent)` helper, after the dual-namespace PDS deletion converges (per ADR-0004):

1. Calls `deleteProfile(did)` from `src/lib/db/queries.ts` — this removes the `profiles` row. `profile_tags` and `profile_intentions` cascade automatically per the FK `ON DELETE CASCADE` clauses in `src/lib/db/schema.ts`.

2. Explicitly deletes the `user_preferences` row: `DELETE FROM user_preferences WHERE did = ?`. This row has no FK to `profiles` and would otherwise persist as orphaned per-user state.

3. Calls `deleteOAuthSession(did)` from `src/lib/db/queries.ts` — clears the server-side OAuth session row.

The API handler then destroys the iron-session cookie before returning, so the client side of the session is also cleared.

### Schema impact

**No schema changes.** The decision deliberately keeps the schema unchanged so that future contributors do not have to reason about a `deleted_at` column that is unused.

### Browse path

**No change to browse-path queries.** Hard-deleted rows are physically absent from `profiles`, so the existing `SELECT … FROM profiles` queries naturally exclude them. No `WHERE deleted_at IS NULL` predicate is added (and none should be added without an ADR amendment).

### About-page copy

The existing copy at `src/app/about/page.tsx:71` — *"Delete your profile from Nomare and the record disappears from your repo."* — is honored exactly. No revision required as part of this implementation.

### What "v1" means here

This ADR explicitly scopes the hard-delete decision to v1. It does **not** preclude a future ADR introducing soft delete if real user behavior demonstrates a need (e.g., measurable rate of "I deleted by mistake" support requests). The current judgment is that:

- The typed-`DELETE` confirmation in ADR-0005 already provides strong friction against accidents.
- Soft delete materially expands scope (schema change, scheduled job, browse filter) for a problem that may not exist in this user base.
- A future "soft delete" ADR can revisit this with operational evidence in hand. It would supersede this ADR rather than augment it.

## Consequences

### Constrains

- **No `deleted_at` columns may be added to tables in the profile bounded context** without an ADR amendment that supersedes this one. This includes `profiles`, `user_preferences`, `profile_tags`, `profile_intentions`. The schema is intentionally stripped of soft-delete machinery so that future contributors cannot accidentally introduce a half-implemented soft-delete by adding the column.

- **The about-page copy is now load-bearing.** Any future change to deletion semantics (introducing a grace window, deferred deletion, etc.) must update the copy in lockstep. The copy is the user's contract; the implementation must remain truthful to it.

- **Recovery is impossible after deletion.** A deleted user's only path to "recover" is to re-register: log in via OAuth on the same DID and create a fresh profile. None of their previous data (preferences, indexed handle history, list membership) is recoverable. Support cannot intervene; there is no "deleted but recoverable" state.

- **Idempotency in the deletion handler.** Because hard delete is final, the handler must be safe to call repeatedly without surprising side effects. ADR-0004's `RecordNotFound`-as-success semantics covers PDS retries; the local-state deletes are already idempotent (`DELETE WHERE did = ?` against a non-existent row is a no-op).

### Permits

- **Schema simplicity.** No `deleted_at`, no soft-delete index, no browse-path filter. Future contributors reading `src/lib/db/schema.ts` see exactly what is current state.

- **Truthful copy.** Marketing/about-page copy can describe deletion as immediate and complete without weasel words.

- **A clean future amendment.** If soft delete is introduced later, it is a single deliberate ADR with a schema migration, not a creeping expansion of an existing soft-delete shim.

### Does not

- **Does not** preclude a future ADR introducing soft delete. The decision is for v1, scoped to the present implementation phase.

- **Does not** affect the moderation list (managed via the service's own credentials by the Jetstream subscriber per ADR-0003 §5). The list-removal is async and is unaffected by the local-vs-soft delete choice.

- **Does not** affect the dual-namespace deletion semantics in ADR-0004. That ADR governs the PDS calls; this ADR governs what happens to local state after the PDS calls converge.

## Session

session-20260508-1749-main — Phase 1 of the "Delete My Account" plan (`docs/context/plan.md`). Pre-Phase Decision 4 ("Grace period / soft delete") is the input to this ADR; this ADR is the codification.
