/**
 * Profile tag shape validation. Single source of truth for what counts as a
 * valid profile tag, shared between client (TagInput) and server (PUT /api/profile).
 *
 * Public interface: `normalizeTag(value)`, `isValidProfileTag(value)`,
 * `TAG_PATTERN`, `TAG_RULE_DESCRIPTION`.
 * Owner context: Profile bounded context. The lexicon enforces maxGraphemes: 64;
 * this validator narrows further to lowercase alphanumerics and internal hyphens to
 * keep tags useful for overlap matching and free of URL-shaped pollution.
 *
 * Pipeline: callers SHOULD normalize candidate tags through `normalizeTag` first,
 * then validate with `isValidProfileTag`. Normalization fixes user-formatting
 * surface (uppercase, leading `#`, surrounding whitespace, internal spaces) so
 * those never count as pollution. The validator stays strict — URLs, dots,
 * slashes, and other shape violations are still rejected.
 */

export const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

export const TAG_RULE_DESCRIPTION =
  "lowercase letters, digits, and internal hyphens; 2-64 characters; no URLs, dots, or slashes";

export type TagValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Normalize a candidate tag before validation.
 *
 * Lowercases, strips a leading `#`, trims surrounding whitespace, replaces any
 * internal whitespace run with a single hyphen, collapses adjacent hyphens to
 * one, and trims leading/trailing hyphens. Idempotent —
 * `normalizeTag(normalizeTag(x)) === normalizeTag(x)`.
 *
 * Returns "" for non-strings or whitespace-only input. Callers should check for
 * empty after normalization and either skip the tag or treat it as a length
 * failure when validating.
 *
 * @param value Candidate tag from user input, an API request, or a PDS record.
 * @returns The normalized tag, or "" if normalization wiped it to nothing.
 */
export function normalizeTag(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Decide whether a candidate tag is acceptable.
 *
 * Strict — does not normalize. Callers that accept user input should pass the
 * value through `normalizeTag` first; this function reports whether the
 * already-normalized value matches the shape rule.
 *
 * @param value Candidate tag string. Expected to be already normalized.
 * @returns `{ ok: true }` when the tag matches `TAG_PATTERN`, otherwise
 *          `{ ok: false, reason }` with a human-readable explanation suitable
 *          for inline UI feedback or an API error payload.
 */
export function isValidProfileTag(value: string): TagValidationResult {
  if (typeof value !== "string") {
    return { ok: false, reason: "tag must be a string" };
  }
  if (value.length < 2) {
    return { ok: false, reason: "tag must be at least 2 characters" };
  }
  if (value.length > 64) {
    return { ok: false, reason: "tag must be at most 64 characters" };
  }
  if (value !== value.toLowerCase()) {
    return { ok: false, reason: "tag must be lowercase" };
  }
  if (!TAG_PATTERN.test(value)) {
    return {
      ok: false,
      reason: `tag must contain only lowercase letters, digits, and internal hyphens (no URLs, dots, or slashes)`,
    };
  }
  return { ok: true };
}
