# ADR 0001 — Match Mode

**Status:** Accepted
**Date:** 2026-05-05
**Session:** session-20260505-0413-main

## Context

DateSky currently exposes a flat browse view: any authenticated user sees every indexed profile. As the userbase grows, this scales poorly along two axes:

1. **Signal-to-noise.** Most profiles in the index are not relevant to a given viewer's preferences (gender, age, location, intent). A flat browse forces the viewer to manually filter every time.
2. **Spam resistance.** Any user-tag system can be gamed by adding many tags. Without a counter-pressure, optimal spammer strategy is "tag everything to match everyone."

The natural product response is a **match mode**: a viewer-controlled filter and ranking that surfaces compatible profiles first. This raises two non-trivial design questions that constrain future sessions:

- **Where do match preferences live?** On the public AT Protocol profile record, or in DateSky's private database?
- **How does ranking handle adversarial tagging without capping legitimate expression?**

This ADR locks both, plus the supporting rules.

## Decision

### 1. Privacy split: preferences private, profile public

- **Public** (lives in `app.datesky.profile` on the user's PDS, visible to anyone): user's own gender, age, location, tags, intentions. Already the case today; no lexicon change.
- **Private** (lives in DateSky's SQLite, never published to the network): the user's *match preferences* — gender preferences, dating age range, friendship age range, location filter, and the match-mode toggle itself.

**No public preference data, ever.** Future sessions may be tempted to "improve matching" by exposing preferences to the network (e.g., for cross-app interop). This ADR rejects that direction. Preferences are stated by the viewer about candidates and should not become observable attributes of the viewer.

### 2. Match mode is a binary toggle on the existing browse pipeline

When the toggle is **off**, browse behaves as today: every indexed profile, ordered by indexed time.

When the toggle is **on**, browse is filtered and ranked:

**Hard filter (binary in/out)** — a candidate must pass *all* of:
- Intent: candidate's `intentions` includes the viewer's chosen intent (`dating` or `friendship`)
- Gender: candidate's `gender` is in the viewer's gender-preference set
- Age: candidate's `age` is within the viewer's age range for the chosen intent (dating range vs friendship range)
- Location: candidate's `location` matches the viewer's location filter (exact match for v1; geo distance is a later upgrade)

**Hard floor (binary)** — candidates must share at least **2 tags** with the viewer to count as a tag-based match. Profiles sharing 0 or 1 tag are dropped from match mode results.

**Soft rank** — within the candidates that pass the filter and floor:

```
score = tag_overlap / sqrt(candidate_tag_count)
```

Candidates are ordered by `score` descending. **Scores are not displayed** — only the order is visible to the viewer.

### 3. "Close" surfacing: per-axis breakdown

Profiles that fail **exactly one** hard filter are not shown in the feed but are counted and surfaced as a breakdown beneath the match list:

> Close: 8 outside age range · 3 different location · 1 different gender preference

This tells the viewer *which* filter is the friction point and lets them make an informed decision to relax it. Profiles failing 2+ filters are not surfaced at all.

The hard-floor (min-overlap of 2 tags) does **not** participate in the "close" calculation — only the four hard filters do.

### 4. Spam resistance without capping

DateSky **does not cap** the number of tags a user may add to their profile. Capping is rejected on UX grounds — it limits legitimate expression for the long tail of niche interest tags.

Three layered defenses are used instead:

**Opposition detection (save-time, hard reject).** A registry of mutually-exclusive tag groups blocks contradictory profiles at save. Initial groups:

- Diet: `vegan`, `vegetarian`, `pescatarian`, `omnivore`, `carnivore`
- Smoking: `smoker`, `non-smoker`
- Drinking: `sober`, `social-drinker`, `heavy-drinker`
- Kids: `has-kids`, `wants-kids`, `no-kids`, `childfree`
- Relationship style: `monogamous`, `polyamorous`, `enm`, `relationship-anarchist`
- Schedule: `morning-person`, `night-owl`

Any group with 2+ tags from the same axis on a single profile triggers a save rejection with a clear error. The registry is conservative and additive — only axes where contradiction is genuinely meaningful.

**Length normalization (rank-time).** The `sqrt(candidate_tag_count)` denominator in the rank score automatically penalizes shotgun-tagging. A 100-tag profile needs ~4.5× the overlap of a 5-tag profile to rank equally. Spammers lose to the math without ever hitting a cap.

**Min-overlap floor (rank-time).** Below 2 shared tags, tag-based matching is meaningless on any reasonable index size. Drop those candidates regardless.

**Deferred: rarity weighting (TF-IDF).** Once the index has enough profiles for "rare" to mean something, individual matched tags should be weighted by inverse document frequency. At 70 profiles every tag is rare; building this now produces meaningless weights. Revisit when the userbase reaches ~1000 profiles.

### 5. Tag normalization at save

Orthogonal to spam, but enforced at the same boundary: tags are lowercased, trimmed, deduplicated, and limited to alphanumeric + dash + underscore. Without this, `Music`, `music`, `music ` are three "different" tags and matching breaks silently.

### 6. Age range floors and intent split

- The dating age range has a hard floor of **18**. The UI does not allow values below 18 in the dating range. The friendship range has the same floor for v1.
- The friendship range and dating range are *separate* preferences. A user can choose to see only dating candidates, only friendship candidates, or both — but the ranges are evaluated independently against the candidate's age.
- The candidate must have at least one matching-pool intent in their public `intentions` field for a given pool to apply. The lexicon defines four intention tokens (`dating`, `friends`, `casual`, `long-term`); they map to pools as follows:
  - **Dating pool:** `dating`, `casual`, or `long-term` (all are flavors of romantic intent)
  - **Friendship pool:** `friends` (also `friendship`, defensively, in case of hand-written records)
- A candidate with only `casual` still appears for a viewer searching the dating pool. A candidate with only `friends` is invisible to dating searchers and vice versa.

## Consequences

### What this constrains going forward

1. **No match preferences in `app.datesky.profile`.** If a future session needs to expose preferences across apps, that requires a new ADR explicitly overriding this one.
2. **Match-mode ranking is deterministic and explainable.** The score is a closed-form expression of two integers. No ML, no opaque models. This is preserved by future sessions.
3. **Tags are uncapped.** Future sessions that propose a hard cap must overturn this ADR with new evidence (e.g., observed harm).
4. **Opposition registry is additive.** Adding new opposition groups is fine. Removing one needs justification — anything that ships rejects existing profiles, and removing a group could *un*-reject profiles that have since become invalid.
5. **TF-IDF deferred until ~1000 profiles indexed.** Premature optimization until then.
6. **"Close" calculation is bounded to the four hard filters.** Tags do not contribute to "close." This keeps the surface understandable.

### Implementation surface (informational, not part of the decision)

- New SQLite table `user_preferences` keyed by DID.
- New `app.datesky.preferences` route handlers for read/update.
- New `/match` view (or `/browse?mode=match`).
- New `/settings` page covering photos, compact, match toggle, and the preference inputs.
- New module `src/lib/tags/opposition.ts` containing the registry and validator.
- Tag normalization in the existing profile save handler.

### Risks

- **The opposition registry is opinionated.** Some users may legitimately self-describe across an axis we've coded as exclusive (e.g., a sober person who occasionally drinks socially). Mitigation: keep the registry conservative; only include axes where contradiction is unambiguous; provide a clear save-error message naming the conflict.
- **Length normalization punishes thoughtful taggers with rich self-descriptions.** A user with 30 sincere tags ranks below a user with 5 strategically-chosen tags even if tag overlap is similar. The penalty is intentional and we accept it; a 30-tag profile already conveys broad-but-shallow interests, which is meaningfully different from a focused 5-tag profile.
- **Exact-match location is crude.** "Chicago" doesn't match "Chicago, IL" or "Oak Park, IL." Acceptable for v1; geo-distance is a clear later upgrade with a lexicon-friendly path (location is already a free-text field).

## Session

This ADR was produced in `session-20260505-0413-main` after a design conversation that spanned branding refresh, settings, and match mode. The branding refresh and settings work are tracked separately. Implementation of match mode follows this ADR.
