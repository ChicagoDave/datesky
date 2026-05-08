# ADR 0003 — AT Protocol Lexicon Dual-Publish Migration

**Status:** Accepted
**Date:** 2026-05-07
**Session:** session-20260507-2214-main

## Context

The brand rename from DateSky to Nomare (ADR-0002) leaves the AT Protocol lexicon namespace `app.datesky.profile` as a load-bearing identifier in the product. This ADR records how that namespace migrates to `app.nomare.profile`.

### Production fact at decision time

**85 real `app.datesky.profile` records exist on user-controlled PDSes** as of 2026-05-07 (verified via the local indexer's `profiles` table count). Those records live in repos the project does not own — they cannot be unilaterally migrated, deleted, or rewritten.

### Options considered

Three strategies were evaluated when planning the rebrand (`docs/context/plan.md` Decision A):

1. **Hard rename** — `app.datesky.profile` → `app.nomare.profile`, no transition window. Rejected: orphans 85 existing records the moment the indexer's `wantedCollections` changes. Acceptable only when zero existing records exist; that bar is not met.

2. **UX-only rebrand** — keep `app.datesky.profile` as the permanent NSID, change only display strings. Rejected: bakes a permanent mismatch between brand identity ("Nomare") and protocol identifier ("app.datesky.*") into every record written from this point forward. The mismatch compounds as the network grows around the new brand.

3. **Dual-publish during transition** — the app writes records to both NSIDs and reads with new-first-then-fallback. **Selected.** Bounded, well-trodden migration pattern that preserves continuity for existing records while moving the canonical NSID to match the brand.

The dual-publish strategy specifically does **not** include an active backfill of the 85 existing records. Doing so would require the project to hold or refresh OAuth tokens for users who may never log in again, which is neither feasible nor consensual. Migration is **passive**: existing users upgrade their record organically when they next save their profile.

## Decision

### 1. Lexicon files

- **New:** `lexicons/app/nomare/profile.json` — exact mirror of the existing schema with `id: "app.nomare.profile"` and an updated description. Schema is byte-for-byte identical otherwise; no field names, types, or constraints change.
- **Retained:** `lexicons/app/datesky/profile.json` stays in the repo with its `description` field updated to flag legacy status. The file is not deleted during the transition window so that legacy records remain semantically validated against an in-tree schema.

### 2. TypeScript module

In `src/lib/atproto/lexicon.ts`:

- `COLLECTION = "app.nomare.profile"` — the canonical NSID, used for all new writes and the primary read path.
- `LEGACY_COLLECTION = "app.datesky.profile"` — used for the legacy mirror write and the read fallback.
- The `DateSkyProfile` interface is renamed to `NomareProfile`. A single TypeScript type covers both NSIDs because the schemas are identical. Import sites updated in the same commit.

### 3. Read path

Both `fetchProfileFromPds` (in `src/lib/atproto/resolve.ts`) and `GET /api/profile` (own profile) implement:

1. Attempt `getRecord(repo=did, collection="app.nomare.profile", rkey="self")`.
2. On HTTP 400/404 (record not found), retry with `collection="app.datesky.profile"`.
3. Return `null` if neither namespace yields a record.

Worst-case read latency for legacy-only users is **two PDS round-trips**. The Next.js `revalidate: 60` cache absorbs the cost on subsequent reads.

### 4. Write path

In `PUT /api/profile`:

1. **Primary write:** `putRecord` to `app.nomare.profile/self`. Failure of this write fails the request — the user sees an error.
2. **Legacy mirror write:** `putRecord` to `app.datesky.profile/self`, executed after the primary succeeds. **If the legacy write fails, the failure is logged and the request still returns success.** Rationale: the legacy namespace is being phased out; we will not block user-facing functionality on its compatibility.

This ordering ensures every active user converges to having both records (until legacy is sunset). Atomicity is bounded — there is a brief window where the new record exists and the legacy mirror has not yet been written, but a reader during that window reads the new record (which is the canonical one) successfully.

### 5. Indexer

`scripts/jetstream.ts` subscribes to **both** collections via `wantedCollections=app.nomare.profile,app.datesky.profile`. The local SQLite `profiles` table is keyed by DID (collection-agnostic), so both events for a dual-writing user resolve to the same row via `ON CONFLICT(did) DO UPDATE`. The two upserts are idempotent: identical record content from either NSID produces the same row state.

No backfill of historical events is required when adding the new NSID to `wantedCollections` — the new collection has no prior events to replay. Existing legacy events continue to flow through the same handler.

### 6. Real-path test

Per CLAUDE.md rule 12a, this migration is an integration with an owned dependency (the lexicon files this repo ships and the PDS write path it spawns). A real-path test, not a stub, is required.

`scripts/test-dual-publish.ts` executes the dual-publish path end-to-end against a live PDS. Because the project does not yet have a containerized PDS test harness, the test runs against `bsky.social` via an operator-provided test account (app password supplied through environment variables; documented in the script header). The test asserts:

1. **Write path:** writing through `PUT /api/profile` produces both `app.nomare.profile/self` and `app.datesky.profile/self` records on the test account's PDS.
2. **Read path — new only:** with only `app.nomare.profile/self` present, `fetchProfileFromPds` returns the record.
3. **Read path — legacy only:** with only `app.datesky.profile/self` present (legacy user simulation), `fetchProfileFromPds` falls back and returns the record.
4. **Read path — both:** with both records present, `fetchProfileFromPds` returns the new namespace's record (verified by an injected sentinel field).
5. **Cleanup:** the script deletes both records from the test PDS after assertions complete.

This is a manual-run test, invoked by an operator before any production deploy of the dual-publish change. A subsequent session may convert it to a containerized harness.

### 7. Display strings

User-facing references to the NSID surface in two places:

- `src/app/about/page.tsx` — the "Where your data lives" section displays the NSID as code text. Updated to `app.nomare.profile`. The legacy fallback is implementation detail and is not surfaced to users.
- `docs/start.md` — the lexicon section displays the NSID and a footer link to the schema file. Updated to point at the new lexicon file with a parenthetical note about legacy fallback.

### 8. Deprecation criteria (deferred)

Sunsetting the legacy mirror write is not part of this ADR. A future ADR will set the criterion (likely "after N days when M% of indexed profiles have a `app.nomare.profile` record present"). Until then, the legacy mirror continues to be written.

## Consequences

### Constrains

- **Schema changes** to the profile lexicon during the transition window must be applied to **both** files in lockstep. The TypeScript `NomareProfile` interface must remain valid for both NSIDs. A schema divergence between the two would silently corrupt the dual-write contract.
- **Read latency** for legacy-only users is double (two PDS round-trips). Worth monitoring after deploy; if measurable, consider a short-TTL "legacy fallback hint" cache keyed by DID.
- **Indexer cursor** must continue to track a single position — the jetstream subscription is one stream covering both collections, so this works without changes.
- **OAuth scopes** must permit writes to both NSIDs. AT Protocol OAuth currently grants repo-write scope at the repo level (not per-collection), so existing scope is sufficient.
- **PDS storage** doubles per active user during the transition. With ~85 users and small profile records (≤ a few KB each), the absolute cost is negligible.

### Permits

- **A clean cutover later.** When the deprecation ADR fires, the legacy mirror write is removed in one commit; the read fallback remains until indexed-profile coverage of the new NSID is high enough to drop it.
- **Other apps on the network** can adopt the new NSID without coordinating with this app — the new NSID is a fresh namespace with no prior consumers to break.

### Does not

- **Does not** rewrite the 85 existing records. They remain at `app.datesky.profile` until each user next saves their profile.
- **Does not** change the local SQLite `profiles` table schema. The table is collection-agnostic and absorbs both NSIDs without migration.
- **Does not** change OAuth client metadata, redirect URIs, or session storage. Phase 3 handles those concerns separately.

## Session

session-20260507-2214-main — Phase 2 of the rebrand plan (`docs/context/plan.md`). Decision A in that plan ("Dual-publish during transition") is the input to this ADR; this ADR is the codification.
