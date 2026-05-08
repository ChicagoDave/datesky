# Session Plan: DateSky → Nomare Rebrand

**Created**: 2026-05-07
**Overall scope**: Full codebase, metadata, protocol, and infrastructure rename from "DateSky" to "Nomare" across all user-facing text, code identifiers, AT Protocol lexicons, OAuth client registration, and hosting configuration.
**Bounded contexts touched**: Identity/Auth (OAuth client metadata), Profile (lexicon namespace), PublicSurface (pages, OG tags, manifests), Infrastructure (DNS, TLS, reverse proxy), DevMetadata (package.json, README, GitHub)
**Key domain language**: lexicon namespace, client_id, redirect_uri, dual-publish, 301 redirect, TLS provisioning

---

## Pre-Phase Decisions — Resolved 2026-05-07

All four decisions resolved this session. Phase 1 is unblocked. Resolution rationale is recorded inline; the full option analysis is preserved below the resolution lines for reference.

### Decision A — Lexicon namespace strategy

**Resolved: Dual-publish during transition.**

Production fact established: 85 real `app.datesky.profile` records exist. Hard rename is off the table — those records live on user-controlled PDSes and cannot be unilaterally migrated. UX-only rebrand was rejected because permanent mismatch between brand ("Nomare") and protocol identifier ("app.datesky.*") would compound as the network grows around the new identity. Dual-publish is the bounded, well-trodden migration pattern: write both namespaces during a transition window, read `app.nomare.profile` first with `app.datesky.profile` fallback, deprecate the old namespace once active users have triggered a dual-write. Codify in **ADR-0003** before Phase 2.

Original options analysis:

1. **Hard rename** (`app.datesky.*` → `app.nomare.*`): clean protocol identity going forward, but any existing user records written under `app.datesky.profile` become orphaned from the new app's queries. The current indexer (jetstream subscriber) would need to be updated simultaneously. Acceptable only if zero real user records exist under the old namespace — confirm before choosing.

2. **Dual-publish during transition**: the app writes records to both `app.datesky.profile` and `app.nomare.profile` for a window, and reads from both. Complex but preserves continuity for any existing records. Appropriate if real users have live records.

3. **Keep `app.datesky.*` as the permanent protocol namespace, rebrand only at the UX layer**: the lexicon NSID stays `app.datesky.profile` forever; only display strings change. Simplest and safest if there are existing records and a migration window is not feasible. Introduces a permanent mismatch between brand identity ("Nomare") and protocol identifier ("app.datesky.*") — acceptable as a deliberate trade-off if documented in an ADR.

### Decision B — OAuth client migration strategy

**Resolved: Hard cutover with forced re-login.**

With 85 active users, a one-time forced re-login is tolerable and clean. "Log in again with your Bluesky account" is a 30-second action. Parallel serve adds permanent infrastructure complexity (two `client-metadata.json` endpoints, two sets of redirect URIs, two client_ids in the AT Protocol OAuth cache forever) for a marginal benefit at this scale. Phase 3 handles the cutover; release notes must surface the re-login expectation.

The existing `client_id` is `https://datesky.app/client-metadata.json`. AT Protocol's OAuth caches client metadata by `client_id` URL. A new `client_id` (`https://nomare.net/client-metadata.json`) is treated as a completely new OAuth client — existing sessions tied to the old `client_id` will not carry over.

Original options analysis:

1. **Parallel serve**: continue serving `client-metadata.json` at `datesky.app` indefinitely while also serving it at `nomare.net`. Existing logged-in sessions remain valid. New logins use the new client. Requires keeping `datesky.app` alive as a functional host, not just a redirect.

2. **Hard cutover with forced re-login**: change `client_id` to `nomare.net`, invalidate all current sessions (users get re-login prompt), decommission `datesky.app`'s OAuth endpoints. Acceptable only if the current user base is small enough that forced re-login is tolerable.

### Decision C — Hosting cutover strategy

**Resolved: Phased.**

`nomare.net` goes live first (Phase 4) alongside `datesky.app`. `datesky.app` remains a functional host while Phase 2 (lexicon migration) and Phase 3 (OAuth cutover) complete. A follow-on session retires `datesky.app` to a 301 redirect on non-OAuth paths once the OAuth hard cutover is observed-stable.

Original options analysis:

1. **Parallel hosts**: `nomare.net` serves the app; `datesky.app` remains live as the OAuth client endpoint and serves a soft "we moved" banner. Both point to the same VPS. Nginx/Caddy serves both vhosts.

2. **Immediate 301**: `datesky.app` redirects to `nomare.net` on all paths from day one of Phase 4. Works only if OAuth parallel-serve is also resolved (a 301 on `/client-metadata.json` breaks OAuth).

3. **Phased**: `nomare.net` goes live first (Phase 4); `datesky.app` stays live for 30–60 days, then switches to 301 on non-OAuth paths while keeping OAuth paths alive.

### Decision D — Visual identity timing

**Resolved: Text rename first, visuals later.**

Phase 1–5 complete the functional rebrand against the existing visual treatment. A follow-on design session produces the Nomare wordmark with the pronunciation cue (kerning, italic third syllable, or accent treatment per ADR-0002), updates OG image assets, and revisits color tokens. Phase 1 is not blocked on logo work; the About page may temporarily reference a placeholder mark or no mark.

Original options analysis:

1. **Text rename first, visuals later**: Phase 1–4 complete the functional rebrand; a follow-on session handles logo, color tokens, and typography under the Nomare name.

2. **Block Phase 1 on having at least a wordmark**: ensure the About page and OG tags reference a real logo asset before shipping.

---

## Phases

### Phase 1: Surface Text and Code Identifier Rename
- **Tier**: Medium
- **Budget**: 250 tool calls
- **Domain focus**: PublicSurface and DevMetadata — all user-facing strings and code identifiers that contain "DateSky" or "datesky", excluding protocol namespace and OAuth endpoint URLs (those are sequenced later)
- **Entry state**: Decisions A–D above have been answered. Git working tree is clean on `main`.
- **Deliverable**:
  - `package.json`: `name`, `description`, `homepage`, repository URL updated to `nomare` / `nomare.net`
  - `src/app/layout.tsx`: title and description metadata updated to Nomare
  - `src/app/about/page.tsx`: all "DateSky" display text replaced with "Nomare"; About page updated to include etymology and pronunciation cue ("Nomare — Italian, *to call by name*, pronounced *no-MAR-ay*"); GitHub link updated to new repo name if/when renamed, or left as-is with a note
  - `src/app/settings/page.tsx`: display strings updated; header comment updated
  - `src/app/profile/[did]/page.tsx`: OG siteName, title strings updated
  - `src/components/Footer.tsx`: trademark disclaimer updated to Nomare; header comment updated
  - `src/components/ProfileForm.tsx`: "Your name on DateSky" placeholder updated
  - `src/lib/session.ts`: `cookieName` changed from `datesky_session` to `nomare_session` (NOTE: this invalidates all existing browser sessions — acceptable if user count is small; confirm before executing)
  - `src/lib/db/index.ts`: DB filename `datesky.db` updated to `nomare.db` OR left as-is with a comment that the filename is not user-facing (choose one, document rationale)
  - `src/app/api/settings/route.ts`: header comment updated
  - `docs/start.md`: document rewritten as "Nomare: Open Community on AT Protocol" with updated lexicon references (if Decision A chose hard rename) or with a note (if keeping old namespace)
  - All files that reference "DateSky" in comments-only updated
  - NOTE: `COLLECTION` constant in `lexicon.ts`, `client_id` in `oauth-client.ts`, and `public/client-metadata.json` are intentionally deferred to Phase 2 and Phase 3
- **Exit state**: `grep -r "DateSky\|datesky" src/ --include="*.ts" --include="*.tsx"` returns only the lexicon COLLECTION constant and the OAuth publicUrl default — nothing else. `package.json` references Nomare. `docs/start.md` is updated.
- **Status**: COMPLETE — 2026-05-07
  - Decision (a) at execution time: cookie rename in `src/lib/session.ts` deferred to **Phase 3** (bundle the forced re-login with the OAuth hard cutover so users only re-login once).
  - Decision (b) at execution time: DB filename `data/datesky.db` retained with header comment in `src/lib/db/index.ts`; rename bundled with **Phase 4** infra migration (avoids a one-off VPS copy/symlink step).
  - Decision (c) at execution time: `package.json` `repository.url` / `homepage` / `bugs.url` and the `github.com/chicagodave/datesky` link in `src/app/about/page.tsx` are left for **Phase 5** (simultaneous with the actual GitHub repo rename so URLs don't 404 in the meantime).
  - Residual `datesky` refs in `src/` (verified): lexicon COLLECTION + `DateSkyProfile` interface (Phase 2); OAuth `publicUrl`/key id/`client_name` (Phase 3); `cookieName` in `session.ts` (Phase 3); db filename in `db/index.ts` (Phase 4); GitHub URL in `about/page.tsx` (Phase 5). All deferred categories match the per-phase deliverable lists.
  - Removed the "working title — open to a better one" paragraph from About; brand is locked.
  - About page gained an "About the name" section with etymology and pronunciation per ADR-0002.

### Phase 2: AT Protocol Lexicon Namespace Migration
- **Tier**: Medium
- **Budget**: 250 tool calls
- **Domain focus**: Identity — the `app.datesky.profile` NSID is the protocol-layer identity of every user record; this phase executes whichever lexicon strategy was chosen in Decision A
- **Entry state**: Phase 1 is committed. Decision A has been made and documented in ADR-0003. Production record count under `app.datesky.profile` is known.
- **Deliverable** (if Decision A = hard rename):
  - `lexicons/app/datesky/profile.json` renamed/moved to `lexicons/app/nomare/profile.json`; `id` field updated to `app.nomare.profile`; description updated to "A profile on the Nomare network"
  - `src/lib/atproto/lexicon.ts`: `COLLECTION` updated to `"app.nomare.profile" as const`; `DateSkyProfile` interface renamed to `NomareProfile`; header comment updated
  - All import sites updated: `ProfileView.tsx`, `ProfileForm.tsx`, `queries.ts`, `resolve.ts`
  - Jetstream subscriber (if present in `src/`) updated to subscribe to `app.nomare.profile` collection; if the subscriber is external/infrastructure-only, document the required operator action
  - ADR-0003 written: records the lexicon strategy decision, the production record count at decision time, and the migration approach
  - Real-path test (per CLAUDE.md rule 12a): a script or test that (a) writes an `app.nomare.profile` record to a test PDS, (b) reads it back via the app's `resolve.ts` path, and (c) confirms the record is retrieved correctly. This test must exercise the real atproto client, not a mock.
- **Deliverable** (if Decision A = keep old namespace):
  - `src/lib/atproto/lexicon.ts` header comment updated to document the deliberate mismatch
  - ADR-0003 written explaining why `app.datesky.*` is retained as a permanent protocol identifier
  - No lexicon file renames
- **Exit state**: `COLLECTION` in `lexicon.ts` matches the chosen namespace. ADR-0003 is committed. Real-path test passes against a live (dev or staging) PDS.
- **Status**: COMPLETE — 2026-05-07
  - Decision A executed via dual-publish (not the originally listed branches). ADR-0003 written codifying the strategy: passive migration (no bulk re-write of 85 existing records — they upgrade organically on next save), nomare-first reads with legacy fallback, dual-write with legacy as best-effort mirror.
  - Open-question resolutions at execution time: real-path test is manual-run with operator-provided app password (option 1b); legacy mirror write logs + returns success on failure (option 2); legacy lexicon JSON retained with `description` field flagging legacy status (option 3 — JSON has no comment syntax, used the description field as the closest equivalent).
  - Files: new `lexicons/app/nomare/profile.json` (mirror of legacy schema, new id); `lexicons/app/datesky/profile.json` description updated; `src/lib/atproto/lexicon.ts` exports `COLLECTION`+`LEGACY_COLLECTION` and `NomareProfile` (rename of `DateSkyProfile`); `src/lib/atproto/resolve.ts` rewritten with read fallback; `src/app/api/profile/route.ts` rewritten with dual-write (primary fails request, legacy mirror best-effort); `scripts/jetstream.ts` subscribes to both collections via `wantedCollections.append`; import sites updated in `ProfileView.tsx`, `ProfileForm.tsx`, `queries.ts`; `about/page.tsx` and `docs/start.md` display strings updated to canonical NSID; `scripts/test-dual-publish.ts` written as the manual real-path test (operator runs with `NOMARE_TEST_HANDLE`/`NOMARE_TEST_APP_PASSWORD` env vars).
  - Real-path test (CLAUDE.md rule 12a): `scripts/test-dual-publish.ts` covers the dual-write produces both records, both-present read returns canonical, legacy-only read falls back. Manual invocation per operator workflow documented in script header.
  - Type-check clean.

### Phase 3: OAuth Client Re-registration at nomare.net
- **Tier**: Medium
- **Budget**: 250 tool calls
- **Domain focus**: Identity/Auth — the OAuth `client_id` is the identity anchor for all user sessions; changing it requires a coordinated update to the published client metadata and a session migration decision
- **Entry state**: Phase 2 is committed. `nomare.net` DNS is live and resolving to the VPS (can be verified before starting). Decision B has been confirmed.
- **Deliverable**:
  - `public/client-metadata.json` updated: `client_id`, `client_uri`, `redirect_uris`, `jwks_uri` all point to `https://nomare.net/...`
  - `src/lib/atproto/oauth-client.ts` updated: `PUBLIC_URL` default changed to `https://nomare.net`; key ID updated from `datesky-key-1` to `nomare-key-1` (NOTE: changing the key ID requires rotating the JWKS — generate a new ES256 key pair and update `public/jwks.json`; the old key can be retained in the JWKS alongside the new one during a transition window)
  - `.env.example` updated: `PUBLIC_URL=https://nomare.net`
  - If Decision B = parallel serve: a second `client-metadata.json` is NOT needed — the old one at `datesky.app` continues to be served by the `datesky.app` vhost (Phase 4); the new one is served at `nomare.net`. No code duplication.
  - If Decision B = hard cutover: all existing OAuth sessions are invalidated; document this in release notes
  - Real-path test (per CLAUDE.md rule 12a): an end-to-end OAuth flow test that (a) initiates an authorization request using the new `client_id`, (b) completes the callback at `https://nomare.net/auth/callback` (can use a staging environment), and (c) confirms a valid session is established. Must exercise the real AT Protocol OAuth stack, not a mock.
- **Exit state**: `grep "datesky.app" public/client-metadata.json src/lib/atproto/oauth-client.ts` returns nothing. OAuth flow completes successfully against the nomare.net host. `.env.example` is updated.
- **Status**: COMPLETE — 2026-05-07
  - Decision B executed via hard cutover. Files modified: `public/client-metadata.json` (URLs + client_name → Nomare), `src/lib/atproto/oauth-client.ts` (PUBLIC_URL default, kid `nomare-key-1`, client_name, header doc), `src/lib/session.ts` (cookieName `datesky_session` → `nomare_session` — Phase 1 deferred work bundled here, header doc), `.env.example` (PUBLIC_URL default), `scripts/generate-keys.ts` (kid literal + refactored to write `public/jwks.json` directly and route private JWK to stdout), `public/jwks.json` (fresh keypair).
  - JWKS strategy: option (b) full keypair rotation (operator's call). Fresh ES256 generated; new public JWK committed; matching private JWK kept out of conversation context by routing to `/tmp/nomare-private-key.json` for operator capture. Pre-deploy operator must paste the private JWK into production `OAUTH_PRIVATE_KEY` env, verify x/y/kid alignment, then shred the temp file. Steps documented in `docs/runbooks/phase3-oauth-cutover.md`.
  - Real-path test (CLAUDE.md rule 12a): not automatable end-to-end (Bluesky consent screen requires human interaction). Captured as an operator-driven verification procedure in `docs/runbooks/phase3-oauth-cutover.md` — to be executed against the live `nomare.net` host after Phase 4 brings the vhost up. Includes `curl` checks on the public documents, browser-driven login + callback, session-cookie shape verification, refresh persistence, and the cross-phase profile read against the dual-publish path.
  - Forced re-login is the intended user-visible consequence of the cookie + client_id cutover; pre-deploy comms note specified in the runbook.
  - Phase 4 newly surfaces: `scripts/jetstream-setup.sh` references the systemd unit name `datesky-jetstream.service`, WorkingDirectory `/home/dave/repos/datesky`, and the DB path `data/datesky.db`. `scripts/backfill-list.ts` and `scripts/jetstream.ts` reference the same DB path. All map to the existing Phase 4 deliverable list (DB rename + infra), but the systemd unit name was not previously enumerated — Phase 4 should include it.
  - Type-check clean.

### Phase 4: Infrastructure — nomare.net Vhost, TLS, and Reverse Proxy
- **Tier**: Small
- **Budget**: 100 tool calls
- **Domain focus**: Infrastructure — bring `nomare.net` live as the canonical host; configure TLS; add `datesky.app` phased redirect per Decision C
- **Entry state**: Phase 3 is committed and deployed to the VPS. `nomare.net` DNS A record points to `66.228.55.224` (confirm with `dig nomare.net`). The VPS's existing web server config (nginx or Caddy) is known.
- **Deliverable**:
  - New server block / Caddyfile entry for `nomare.net` with:
    - TLS via Let's Encrypt (certbot or Caddy automatic)
    - Reverse proxy to the Next.js app on port 3003
  - `datesky.app` server block updated per Decision C:
    - If phased: keep serving the app at `datesky.app` with a header or banner noting the move; do NOT add a 301 yet
    - If immediate redirect: add 301 to `nomare.net` on all paths EXCEPT `/client-metadata.json` and `/jwks.json` (those must remain live for OAuth parallel-serve)
  - `setup.sh` updated to reflect the new domain name
  - Any firewall or rate-limit rules that reference `datesky.app` by name updated
  - NOTE: actual server-side execution (running certbot, reloading nginx) is a manual operator step; this phase produces the configuration files and documents the commands needed
  - Real-path test (per CLAUDE.md rule 12a): `curl -I https://nomare.net/` returns 200 with a valid TLS certificate issued to `nomare.net`. `curl -I https://nomare.net/client-metadata.json` returns the correct JSON with `client_id` pointing to `nomare.net`.
  - **Surfaced during Phase 3:** `scripts/jetstream-setup.sh` systemd unit name (`datesky-jetstream.service`), the systemd `Description`, the `WorkingDirectory` host path (`/home/dave/repos/datesky`), and the journalctl/systemctl commands printed by the setup script all need to be updated to `nomare-jetstream` and the new host path. `scripts/jetstream.ts` and `scripts/backfill-list.ts` carry the `data/datesky.db` filename reference — bundle with the DB rename per the Phase 1 (b) deferral.
- **Exit state**: `nomare.net` serves the app over HTTPS. The VPS config files in the repo reflect the new domain. `datesky.app` behaves per the chosen cutover strategy.
- **Status**: CURRENT

### Phase 5: GitHub Repository and External Metadata
- **Tier**: Small
- **Budget**: 100 tool calls
- **Domain focus**: DevMetadata — GitHub repository name, description, social handles, and any remaining external references
- **Entry state**: Phases 1–4 are committed and deployed. The GitHub repository is still named `datesky` or similar.
- **Deliverable**:
  - GitHub repository renamed to `nomare` via GitHub settings (manual step; document the command or UI step)
  - `package.json` `repository.url` and `homepage` updated to the new GitHub URL
  - `about/page.tsx` GitHub link updated to the new repo URL
  - Any GitHub Actions workflows (`.github/`) that reference the old repo name updated
  - `docs/start.md` GitHub link updated
  - Repository description and topics updated on GitHub (manual step)
  - `pavilion.so` disposition decision documented: either cancel at next renewal or open a resell inquiry — create a note in `docs/adrs/` or a brief ops note; do not leave it as an untracked liability
- **Exit state**: All in-repo references to `github.com/chicagodave/datesky` are updated. No `datesky` references remain anywhere in the codebase except historical ADR text and design mockup files (which are intentionally preserved as design history).
- **Status**: PENDING

---

## Notes on Out-of-Scope Items

**Design mockups** (`docs/design/mockups/`): the three mockup HTML files (`mobile-redesign`, `aviary-mockup`, `pavilion-mockup`) are design history artifacts. They should NOT be edited to replace "DateSky" with "Nomare" — they record decisions made under the prior brand and their historical accuracy is the point.

**USPTO filing**: not a coding task. Deferred to an administrative session. Must precede any marketing launch per ADR-0002.

**Logo / visual identity**: deferred per Decision D. A follow-on design session will produce the Nomare wordmark with pronunciation cue and update OG image assets.

**pavilion.so domain**: flagged as a sunset asset in ADR-0002. Phase 5 creates a brief ops note; the actual cancellation/resale decision is out of scope for coding sessions.
