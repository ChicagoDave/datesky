/**
 * Match-mode evaluation: hard filters, tag-floor, length-normalized ranking.
 *
 * Public interface: matchProfiles(args) — returns ordered matches plus per-axis "close" counts.
 * Owner context: bounded context for match-mode logic. Pure: no DB or HTTP I/O.
 *
 * The algorithm follows ADR 0001 §"Match mode is a binary toggle on the existing browse pipeline":
 *   - Hard filter: intent, gender, age (with intent-aware range selection), location
 *   - Tag floor: applied only when both viewer and candidate have >= 2 tags (symmetric leniency)
 *   - Soft rank: score = tag_overlap / sqrt(candidate_tag_count); descending
 *   - "Close": candidates failing exactly one hard filter are counted by axis, not returned
 *   - "failsBy": per-axis fail count across ALL excluded candidates (multi-axis fails counted in each)
 *
 * Scores are not exposed to callers — only ordering. This is intentional per ADR 0001 §6.
 */
import type {
  IndexedProfile,
  UserPreferences,
} from "../db/queries";

export type CloseAxis = "intent" | "gender" | "age" | "location";

export interface MatchClose {
  intent: number;
  gender: number;
  age: number;
  location: number;
}

export interface MatchResult {
  profiles: IndexedProfile[];
  total: number;
  close: MatchClose;
  /**
   * True when the viewer has fewer than 2 tags on their own profile, in which
   * case the tag floor is suspended and the UI should suggest adding tags.
   */
  viewerTagsInsufficient: boolean;
  /** Total candidates evaluated (input length, after the viewer self-exclusion done by the caller). */
  pool: number;
  /**
   * Per-axis fail counts across every excluded candidate. A candidate failing
   * three axes contributes to all three counters. Used by the UI to diagnose
   * empty-result states ("all 75 candidates failed because of X").
   */
  failsBy: MatchClose;
  /** Candidates that passed every hard filter but failed the tag floor. */
  failedTagFloor: number;
}

interface MatchProfilesArgs {
  viewerPrefs: UserPreferences;
  viewerTags: string[];
  candidates: IndexedProfile[];
  page?: number;
  limit?: number;
}

// Lexicon intentions are: "dating" | "friends" | "casual" | "long-term".
// Casual and long-term are flavors of romantic intent so they map into the dating pool;
// only "friends" maps to the friendship pool. "friendship" is included defensively in case
// older or hand-written records use that token.
const DATING_INTENTION_TOKENS = ["dating", "casual", "long-term"];
const FRIENDSHIP_INTENTION_TOKENS = ["friends", "friendship"];

function hasDatingIntent(intentions: string[]): boolean {
  return DATING_INTENTION_TOKENS.some((t) => intentions.includes(t));
}

function hasFriendshipIntent(intentions: string[]): boolean {
  return FRIENDSHIP_INTENTION_TOKENS.some((t) => intentions.includes(t));
}

function passesIntent(
  prefs: UserPreferences,
  candidateIntentions: string[]
): boolean {
  const hasDating = hasDatingIntent(candidateIntentions);
  const hasFriendship = hasFriendshipIntent(candidateIntentions);
  if (prefs.match_intent === "dating") return hasDating;
  if (prefs.match_intent === "friendship") return hasFriendship;
  return hasDating || hasFriendship;
}

/**
 * Synonym sets for canonical gender preference tokens. Each set contains the
 * tokens or short phrases that, when found in a candidate's normalized gender
 * string, count as a match. Adding a synonym is safe; removing one can silently
 * stop matching real candidates so leave existing entries in place.
 *
 * Single-token synonyms match candidate tokens (whole-word match on a normalized
 * string). Multi-word synonyms match as substrings of the same normalized string;
 * since normalization collapses punctuation/whitespace to single spaces, a
 * substring check on the phrase is unambiguous.
 *
 * Bare single letters ("f", "m") match candidates who self-id with just a letter
 * (e.g. "F (she/her)" → tokens include "f"). They will not false-match longer
 * tokens because matching is by exact token, not substring.
 */
const GENDER_SYNONYMS: Record<string, readonly string[]> = {
  woman: ["woman", "women", "female", "f", "femme", "womxn", "lady", "gal"],
  man: ["man", "men", "male", "m", "guy", "dude"],
  nonbinary: ["nonbinary", "non binary", "nb", "enby", "gnc", "agender"],
  trans: [
    "trans",
    "transgender",
    "transmasc",
    "transfem",
    "transmasculine",
    "transfeminine",
    "ftm",
    "mtf",
  ],
  genderqueer: ["genderqueer", "gq", "queer"],
};

/**
 * Lowercase, replace any non-alphanumeric run with a single space, trim, and
 * collapse internal whitespace. Result is suitable for word-level token matching.
 */
function normalizeGender(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the candidate's normalized gender string matches the given preference.
 * Known canonical preferences (woman, man, nonbinary, trans, genderqueer) use
 * their synonym set. Custom user-typed preferences fall back to a normalized
 * substring match on the whole string.
 */
function genderPreferenceMatches(
  normalizedCandidate: string,
  pref: string
): boolean {
  const normalizedPref = normalizeGender(pref);
  if (!normalizedPref) return false;

  const synonyms = GENDER_SYNONYMS[normalizedPref];
  if (!synonyms) {
    // Custom preference — fall back to substring match on the normalized form.
    return normalizedCandidate.includes(normalizedPref);
  }

  const tokens = new Set(normalizedCandidate.split(" "));
  for (const syn of synonyms) {
    if (syn.includes(" ")) {
      if (normalizedCandidate.includes(syn)) return true;
    } else if (tokens.has(syn)) {
      return true;
    }
  }
  return false;
}

function passesGender(
  prefs: UserPreferences,
  candidateGender: string | null
): boolean {
  if (prefs.gender_preferences.length === 0) return true;
  // Treat missing gender as "no info" rather than auto-fail. This is consistent
  // with passesAge for missing age, and avoids silently excluding partial profiles.
  if (!candidateGender) return true;
  const normalized = normalizeGender(candidateGender);
  if (!normalized) return true;
  return prefs.gender_preferences.some((p) =>
    genderPreferenceMatches(normalized, p)
  );
}

function inAgeRange(
  age: number,
  min: number | null,
  max: number | null
): boolean {
  if (min != null && age < min) return false;
  if (max != null && age > max) return false;
  return true;
}

function passesAge(
  prefs: UserPreferences,
  candidateAge: number | null,
  candidateIntentions: string[]
): boolean {
  if (candidateAge == null) return true;
  if (prefs.match_intent === "dating") {
    return inAgeRange(
      candidateAge,
      prefs.dating_age_min,
      prefs.dating_age_max
    );
  }
  if (prefs.match_intent === "friendship") {
    return inAgeRange(
      candidateAge,
      prefs.friendship_age_min,
      prefs.friendship_age_max
    );
  }
  // 'both' — pass if the candidate is in either pool *with the matching intent*.
  const inDating =
    hasDatingIntent(candidateIntentions) &&
    inAgeRange(candidateAge, prefs.dating_age_min, prefs.dating_age_max);
  const inFriendship =
    hasFriendshipIntent(candidateIntentions) &&
    inAgeRange(
      candidateAge,
      prefs.friendship_age_min,
      prefs.friendship_age_max
    );
  return inDating || inFriendship;
}

function passesLocation(
  prefs: UserPreferences,
  candidateLocation: string | null
): boolean {
  const filter = prefs.location_filter?.trim();
  if (!filter) return true;
  if (!candidateLocation) return false;
  return candidateLocation.toLowerCase().includes(filter.toLowerCase());
}

/**
 * Score for ranking among candidates that already passed hard filters.
 * Tag floor is enforced by the caller, not here — this assumes tag overlap >= 2 already.
 */
function scoreTagOverlap(
  viewerTags: Set<string>,
  candidateTags: string[]
): number {
  let overlap = 0;
  for (const t of candidateTags) if (viewerTags.has(t)) overlap++;
  return overlap / Math.sqrt(Math.max(1, candidateTags.length));
}

/**
 * Count how many tags the candidate shares with the viewer.
 */
function tagOverlapCount(
  viewerTags: Set<string>,
  candidateTags: string[]
): number {
  let n = 0;
  for (const t of candidateTags) if (viewerTags.has(t)) n++;
  return n;
}

export function matchProfiles(args: MatchProfilesArgs): MatchResult {
  const limit = Math.min(args.limit ?? 20, 50);
  const page = Math.max(1, args.page ?? 1);
  const offset = (page - 1) * limit;

  const viewerTagSet = new Set(args.viewerTags);
  const viewerTagsInsufficient = args.viewerTags.length < 2;

  const close: MatchClose = { intent: 0, gender: 0, age: 0, location: 0 };
  const failsBy: MatchClose = { intent: 0, gender: 0, age: 0, location: 0 };
  let failedTagFloor = 0;
  const scored: Array<{ profile: IndexedProfile; score: number }> = [];

  for (const candidate of args.candidates) {
    const intentions = candidate.intentions ?? [];
    const tags = candidate.tags ?? [];
    const failing: CloseAxis[] = [];

    if (!passesIntent(args.viewerPrefs, intentions)) failing.push("intent");
    if (!passesGender(args.viewerPrefs, candidate.gender)) failing.push("gender");
    if (!passesAge(args.viewerPrefs, candidate.age, intentions)) failing.push("age");
    if (!passesLocation(args.viewerPrefs, candidate.location)) failing.push("location");

    if (failing.length > 0) {
      for (const axis of failing) failsBy[axis]++;
      if (failing.length === 1) close[failing[0]]++;
      continue;
    }

    // Passed every hard filter. Apply the tag floor only when both sides have
    // >= 2 tags. Sparse profiles (viewer or candidate) skip the floor and
    // ride to the bottom of the rank instead of being excluded entirely.
    if (!viewerTagsInsufficient && tags.length >= 2) {
      const overlap = tagOverlapCount(viewerTagSet, tags);
      if (overlap < 2) {
        failedTagFloor++;
        continue;
      }
    }

    const score = viewerTagsInsufficient
      ? 0
      : scoreTagOverlap(viewerTagSet, tags);
    scored.push({ profile: candidate, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const total = scored.length;
  const paginated = scored.slice(offset, offset + limit).map((s) => s.profile);

  return {
    profiles: paginated,
    total,
    close,
    viewerTagsInsufficient,
    pool: args.candidates.length,
    failsBy,
    failedTagFloor,
  };
}
