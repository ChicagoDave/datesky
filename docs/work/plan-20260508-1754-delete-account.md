# Session Plan: Delete My Account Feature

**Created**: 2026-05-08
**Overall scope**: Give authenticated Nomare users a real "delete my account" action that deletes their PDS records under both active namespaces (per ADR-0003 dual-publish), cleans up all server-side state for their DID, signs them out, and redirects them — honoring the promise at `src/app/about/page.tsx:71`.
**Bounded contexts touched**: Identity/Auth (OAuth session teardown, sign-out), Profile (PDS record deletion under both namespaces, local index row), PublicSurface (Settings UI confirmation flow, post-delete redirect), DataIntegrity (explicit `user_preferences` + `oauth_sessions` cleanup; CASCADE verification)
**Key domain language**: account deletion, dual-namespace delete, belt-and-braces local delete, Jetstream convergence, PDS record, moderation list removal

---

## Pre-Phase Decisions — Require User Input Before Phase 1

These decisions shape the design. None are pre-decided. The plan surfaces them here so the user can resolve them before implementation begins. At least Decisions 1, 3, and 4 are ADR-worthy (they constrain future sessions).

### Decision 1 — Dual-namespace deletion ordering and failure semantics

When deleting a user's profile we must delete both `app.nomare.profile/self` (canonical) and `app.datesky.profile/self` (legacy mirror per ADR-0003).

**Options:**

A. **Delete both; treat `RecordNotFound` on either as success; abort on any other error.** Rationale: a legacy-namespace record may not exist for users who joined after dual-publish launched. "Not found" is not a failure. A genuine PDS error (network, auth) is a failure worth surfacing.

B. **Delete canonical first; if it succeeds, attempt legacy as best-effort (log on failure, don't abort).** Matches the write path in ADR-0003 (primary fails request, legacy mirror is best-effort). Consistent with existing semantics at the cost of leaving a stale legacy record on the PDS.

C. **Delete canonical only; rely on ADR-0003 deprecation timeline to clean legacy records later.** Simplest. Leaves the legacy record on the PDS indefinitely — inconsistent with the about page promise ("the record disappears from your repo").

**Recommendation:** Option A. The about page copy is a promise of full removal. `RecordNotFound` on the legacy namespace is expected and should be silenced. Any real PDS error surfaces to the user.

---

### Decision 2 — Belt-and-braces local delete

The Jetstream subscriber (`scripts/jetstream.ts:142-153`) already handles ATProto `delete` events: it removes the `profiles` row and calls `listManager.removeMemberByDid`. So local state *will* be cleaned — but with an unknown delay (seconds to minutes depending on Jetstream lag).

**Options:**

A. **Belt-and-braces: call `deleteProfile(did)` and `deleteOAuthSession(did)` synchronously in the API handler**, then rely on Jetstream as a backup that no-ops (deleting a non-existent row is safe). User sees immediate effect; no stale profile flash if they somehow land on their own profile before Jetstream fires.

B. **Rely solely on Jetstream.** Simpler handler. Risk: a redirect race where the user lands on browse before Jetstream fires and sees their own profile in results.

**Recommendation:** Option A — belt-and-braces. Duplicate deletes are idempotent. Belt-and-braces is the stated recommendation in the goal description. The moderation list removal via Jetstream is still fine as async since it uses the service's own credentials (not the user's expiring OAuth session).

---

### Decision 3 — Confirmation UX

Account deletion is irreversible from the user's perspective (their PDS records are deleted; local state is cleaned; they are logged out).

**Options:**

A. **Simple "Are you sure?" modal** with Cancel / Delete buttons. Low friction; appropriate for a small community where accidental taps are rare.

B. **Typed confirmation** — user must type `DELETE` (or their handle) before the button activates. Standard pattern for irreversible destructive actions in developer-facing tools (GitHub, Heroku). Higher friction; unambiguous intent.

C. **Password / handle re-entry.** Does not apply here — authentication is fully delegated to the PDS via AT Protocol OAuth; Nomare does not hold a password. Handle re-entry is possible but adds a round-trip.

**Recommendation:** Option B (typed `DELETE`). The about page describes deletion as permanent and complete. Friction proportional to consequence is appropriate. It also makes accidental button presses impossible without a follow-up.

---

### Decision 4 — Grace period / soft delete

**Options:**

A. **Immediate hard delete (v1).** Matches the about page promise word-for-word: "Delete your profile from Nomare and the record disappears." No DB migration needed. No scheduled job.

B. **Soft delete with a 24/72h grace window.** "Mark as deleted" row, background job clears it later. Allows support recovery. Requires a `deleted_at` column, a scheduled cleanup job, and a mechanism to hide soft-deleted profiles from browse. Substantial scope increase.

**Recommendation:** Option A — hard delete for v1. The about page is explicit. Soft delete would require expanding scope significantly and updating the about page copy.

---

### Decision 5 — Post-delete redirect and messaging

After successful deletion and sign-out, where does the user land?

**Options:**

A. **Redirect to `/` with a banner/flash message** ("Your account has been deleted. Thanks for being part of Nomare."). Conventional; re-uses the existing home page.

B. **Redirect to a dedicated `/goodbye` page** — a short, warm goodbye note with no logged-in state. Slightly more intentional UX; small scope.

C. **Redirect to `/` with no message** (session is cleared; user sees the logged-out home page). Minimal; adequate.

**Recommendation:** Option A or B are both reasonable. B gives a better experience for a feature that is irreversible and emotional.

---

## Phases

### Phase 1: Domain Modeling and Pre-Phase Decisions
- **Tier**: Small
- **Budget**: 100 tool calls
- **Domain focus**: Establish the `AccountDeletion` operation's invariants, variants, Behavior Statement, and Integration Reality Statement before any code is written. Resolve Pre-Phase Decisions 1–5 with the user. Write ADRs for Decisions 1, 3, and 4.
- **Entry state**: This plan is committed. User has read the Pre-Phase Decisions above.
- **Deliverable**:
  - Pre-Phase Decisions 1–5 resolved (user provides answers; planner records them as inline resolutions in this plan, mirroring the rebrand plan format)
  - ADR-0004: dual-namespace deletion semantics and failure handling (Decision 1)
  - ADR-0005: confirmation UX pattern for irreversible account actions (Decision 3)
  - ADR-0006: hard delete vs. soft delete for v1 (Decision 4)
  - Behavior Statement for `deleteAccountForDid(did)` (the to-be-written helper) documented in the session conversation
  - Integration Reality Statement for the delete operation documented in the session conversation (covers: owned SQLite DB path, owned Jetstream pipeline, external ATProto PDS)
  - No code written in this phase
- **Exit state**: All five decisions are resolved and recorded. Three ADRs are committed. Behavior Statement and Integration Reality Statement are ready to drive Phase 2 implementation. Phase 2 entry state is satisfied.
- **Status**: PENDING

---

### Phase 2: API Handler and Deletion Logic
- **Tier**: Medium
- **Budget**: 250 tool calls
- **Domain focus**: Profile and DataIntegrity — implement the `DELETE /api/account` (or `POST /api/account/delete`) route and the `deleteAccountForDid` helper it delegates to. This is the heart of the feature.
- **Entry state**: Phase 1 complete. Decisions 1–5 resolved. ADRs 0004–0006 committed. Behavior Statement for `deleteAccountForDid` is written.
- **Deliverable**:
  - `src/lib/atproto/account-deletion.ts` — new module exporting `deleteAccountForDid(did, agent)`:
    - Deletes `app.nomare.profile/self` via `agent.com.atproto.repo.deleteRecord`
    - Deletes `app.datesky.profile/self` per Decision 1 (Option A: treat RecordNotFound as success, abort on other errors)
    - Calls `deleteProfile(did)` — belt-and-braces local delete (Decision 2, Option A)
    - Calls `deleteOAuthSession(did)` — explicit cleanup (no FK cascade)
    - Deletes `user_preferences` row explicitly (no FK cascade)
    - Does **not** attempt moderation list removal — that is handled asynchronously by the Jetstream delete event
    - Header comment per CLAUDE.md rule 8; method headers per rule 8
  - `src/app/api/account/delete/route.ts` — new POST route:
    - Reads authenticated DID from session; 401 if not logged in
    - Calls `deleteAccountForDid`
    - On success: destroys the iron-session cookie, returns `{ ok: true }`
    - On PDS error: returns appropriate error response
  - Tests (real-path per CLAUDE.md rule 12a):
    - Unit test for `deleteAccountForDid` against the real SQLite DB (in-memory instance seeded with fixture data) — asserts on actual row deletions, not mocks
    - The ATProto `deleteRecord` call may be stubbed in unit tests since the PDS is external, but the stub must be backed by at least one integration note documenting operator-run verification
  - Test suite passes (`npx tsc --noEmit` clean)
- **Exit state**: `DELETE /api/account` (or `POST /api/account/delete`) handler is implemented, documented, tested with GREEN-graded tests. No regressions. Type-check clean.
- **Status**: PENDING

---

### Phase 3: Settings UI — Confirmation Flow and Post-Delete Redirect
- **Tier**: Small
- **Budget**: 100 tool calls
- **Domain focus**: PublicSurface — wire the account deletion action into the Settings page with the chosen confirmation UX (Decision 3) and post-delete redirect (Decision 5).
- **Entry state**: Phase 2 complete. `POST /api/account/delete` is live and tested.
- **Deliverable**:
  - `src/app/settings/SettingsForm.tsx` (or a new sibling component `DeleteAccountSection.tsx`) — adds a "Delete account" section at the bottom of the settings page:
    - Visually separated (border, warning color) from the preferences section
    - Implements the confirmation UX chosen in Decision 3 (typed `DELETE` or modal)
    - "Delete my account" button calls `POST /api/account/delete`
    - On success: redirects to `/` (or `/goodbye` per Decision 5) using `router.push`
    - On API error: displays an inline error message; does not navigate
  - If Decision 5 = Option B (dedicated `/goodbye` page): `src/app/goodbye/page.tsx` — minimal server component, no auth required, warm goodbye copy
  - `src/app/about/page.tsx:71` — verify the copy still accurately describes the deletion behavior after this implementation. Update if needed (it likely does not need to change).
  - No new API routes in this phase — Phase 2's handler is the backend
  - Manual end-to-end smoke test documented in the PR description (operator verifies: typed confirmation activates button, deletion completes, session is cleared, redirect fires)
- **Exit state**: A logged-in user can navigate to Settings, initiate account deletion with the required confirmation, and be signed out and redirected. The settings page renders cleanly for non-deleting users (no UI regression). Type-check clean.
- **Status**: PENDING

---

## Notes on Scope Boundaries

**Moderation list removal** is intentionally left to the Jetstream delete event (async). The list is managed via the service's own credentials (`listManager`), not the deleting user's OAuth session. The Jetstream handler at `scripts/jetstream.ts:142-153` already handles this correctly. No change needed.

**`deleteProfile(did)` at `src/lib/db/queries.ts:68`** — this function exists but is currently only called by Jetstream. Phase 2 calls it synchronously from the API handler too. The function itself needs no modification; only its call sites expand.

**`user_preferences` explicit delete** — the schema confirms `user_preferences` has no FK to `profiles` (`src/lib/db/schema.ts:56-69`). Phase 2 must add an explicit `DELETE FROM user_preferences WHERE did = ?` to `deleteAccountForDid`. This is a DataIntegrity concern, not an API concern.

**Schema change** — no `ALTER TABLE` is needed. Hard delete with immediate effect (Decision 4, Option A) requires no new columns.

**ADR deprecation timeline** — ADR-0003 section 8 defers the sunset criteria for `app.datesky.*` dual-write to a future ADR. The delete feature does not trigger that sunset; it only ensures both namespace records are removed when a user explicitly deletes. The dual-write path for active users is unaffected.
