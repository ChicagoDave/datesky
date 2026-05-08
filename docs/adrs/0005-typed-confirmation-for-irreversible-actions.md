# ADR 0005 — Typed Confirmation for Irreversible Account Actions

**Status:** Accepted
**Date:** 2026-05-08
**Session:** session-20260508-1749-main

## Context

Account deletion is irreversible from the user's perspective:

- Both PDS records (canonical and legacy) are removed (ADR-0004).
- The local index row, `user_preferences` row, and `oauth_sessions` row are cleared.
- The session cookie is destroyed and the user is redirected.

There is no "undo." The user's profile data on Nomare is gone, and re-registration begins from a clean slate.

A friction-proportional confirmation pattern is required so accidental clicks cannot trigger a destructive flow. This ADR fixes the pattern for the first such action (account deletion) and sets the convention for any future irreversible destructive action in Nomare.

### Options considered

**A. Simple "Are you sure?" modal (Cancel / Delete buttons).**
One confirming click after the initial click. Low friction. Appropriate for *reversible* destructive actions (e.g., archiving, soft delete, trash bins) but not for irreversible ones, because a modal can be dismissed-and-reaffirmed accidentally — particularly on touch devices where the confirm button often sits exactly under the user's finger.

**B. Typed confirmation — user must type a literal string (`DELETE` or their handle) before the destructive button activates.**
Standard pattern in developer tools for irreversible operations: GitHub repo deletion, Heroku app destruction, AWS resource deletion (when prompted to type the resource name). The friction is one short string of typing, which is sufficient to defeat any accidental tap or unconfirmed muscle-memory click. Activation logic is purely client-side: the typed string is matched against an expected value and the button is enabled only on exact match.

**C. Handle re-entry / password re-entry.**
Password re-entry is **not applicable**: Nomare delegates authentication entirely to AT Protocol OAuth. The app does not hold a password to verify. Handle re-entry is technically possible but adds round-trips (the handle must be fetched server-side to compare) and offers no friction advantage over typed `DELETE`.

## Decision

**Option B — Typed `DELETE` confirmation.**

### Implementation contract

In the Settings page (`src/app/settings/SettingsForm.tsx` or a sibling `DeleteAccountSection.tsx` component):

1. The destructive section is **visually separated** from the rest of the settings — bordered, warning color (red/orange accent), and labeled clearly ("Delete account" or "Danger zone").

2. An inline **text input** is rendered alongside the action button. Placeholder: `Type DELETE to confirm`. Aria-label set accordingly.

3. The action button (label: "Delete my account") is **disabled** until the input value, **trimmed and uppercased**, equals the literal string `DELETE`. Trim guards against trailing whitespace from autocorrect; the uppercase comparison is done after trimming and is intentional — `delete`, `Delete`, and `DELETE` all activate the button. Rationale: the goal is friction against accidental activation, not pedantry about case.

4. On a **disabled** button click (via keyboard `Enter` while focused), no action fires. On enabled click, the `POST /api/account/delete` request is dispatched.

5. While the request is in flight, the button shows a "Deleting…" label and is disabled to prevent double-submit.

6. On API error, an inline error message renders below the section. The input retains its value so the user can retry by simply clicking again.

7. On API success, the page redirects (per ADR-0006 / Decision 5 → `/goodbye`).

### What "irreversible" means in scope

This ADR's pattern applies to actions that **cannot be undone by the user through the product**:

- Account deletion (this ADR's instance).
- Future: deletion of a moderation list, deletion of a connected account, hard-deletion of an uploaded media artifact.

Reversible destructive actions (un-publishing a profile, archiving a list) do **not** require typed confirmation — a simple modal is sufficient.

### What this pattern is *not*

- It is **not** a security control. A logged-in user has the authority to delete their own account; the typed confirmation does not defend against an authorized user — only against an accidental click. Account-takeover protection lives at the OAuth/PDS layer, not here.
- It is **not** rate-limiting. A determined user can type `DELETE` and click many times. The handler at the API layer is idempotent (per ADR-0004), which is the right correctness guarantee.

## Consequences

### Constrains

- **All future irreversible destructive actions in Nomare must use this pattern.** Inconsistency between actions ("type DELETE here, but click-to-confirm there") would erode user trust in the friction. New destructive flows reference this ADR and reuse the input/button/disabled-until-match construct, ideally extracted as a shared component once a second instance lands.

- **The literal string is `DELETE`.** Future contributors must not change it to a localized string or a randomized challenge without an ADR amendment, because the muscle memory the friction relies on is the universal English uppercase `DELETE` familiar from other developer tools.

- **The case-insensitive activation is intentional.** Pedantic case-sensitivity offers no friction benefit and frustrates real users. Future contributors must not "tighten" this without an ADR amendment.

### Permits

- **Server-side simplicity.** The API handler does not validate a confirmation token or string; activation is a purely client-side concern. This is correct: the typed confirmation is a UI-layer guard against accidents, not an authentication mechanism.

- **Reuse.** When a second irreversible action needs this pattern, the input/button construct can be lifted into a shared component (e.g., `<TypedConfirmAction confirmText="DELETE" onConfirm={...} />`) without revisiting the design.

### Does not

- **Does not** require server-side state or a multi-step flow. The user types and clicks; one API call follows. No "confirmation token issued, awaiting confirmation" round-trip.

- **Does not** apply to reversible destructive actions. Those use simpler confirmations (or no confirmation, if the action is self-evidently reversible from context).

- **Does not** dictate visual design beyond "visually separated" and "warning color." The exact CSS treatment is left to the implementing phase.

## Session

session-20260508-1749-main — Phase 1 of the "Delete My Account" plan (`docs/context/plan.md`). Pre-Phase Decision 3 ("Confirmation UX") is the input to this ADR; this ADR is the codification.
