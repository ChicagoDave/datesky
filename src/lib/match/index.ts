/**
 * Match-mode evaluation: hard filters, tag-floor, length-normalized ranking.
 *
 * Public interface: matchProfiles(args) — returns ordered matches plus per-axis "close" counts.
 * Owner context: bounded context for match-mode logic. Pure: no DB or HTTP I/O.
 *
 * The algorithm follows ADR 0001 §"Match mode is a binary toggle on the existing browse pipeline":
 *   - Hard filter: intent, gender, age (with intent-aware range selection), location
 *   - Hard floor: candidate must share >= 2 tags with the viewer (skipped if viewer has < 2 tags)
 *   - Soft rank: score = tag_overlap / sqrt(candidate_tag_count); descending
 *   - "Close": candidates failing exactly one hard filter are counted by axis, not returned
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

function passesGender(
  prefs: UserPreferences,
  candidateGender: string | null
): boolean {
  if (prefs.gender_preferences.length === 0) return true;
  if (!candidateGender) return false;
  const lower = candidateGender.toLowerCase();
  return prefs.gender_preferences.some((p) =>
    lower.includes(p.toLowerCase())
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
  const scored: Array<{ profile: IndexedProfile; score: number }> = [];

  for (const candidate of args.candidates) {
    const intentions = candidate.intentions ?? [];
    const tags = candidate.tags ?? [];
    const failing: CloseAxis[] = [];

    if (!passesIntent(args.viewerPrefs, intentions)) failing.push("intent");
    if (!passesGender(args.viewerPrefs, candidate.gender)) failing.push("gender");
    if (!passesAge(args.viewerPrefs, candidate.age, intentions)) failing.push("age");
    if (!passesLocation(args.viewerPrefs, candidate.location)) failing.push("location");

    if (failing.length === 1) {
      close[failing[0]]++;
      continue;
    }
    if (failing.length > 1) continue;

    // Passed all hard filters. Apply tag floor unless viewer has too few tags.
    if (!viewerTagsInsufficient) {
      const overlap = tagOverlapCount(viewerTagSet, tags);
      if (overlap < 2) continue;
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
  };
}
