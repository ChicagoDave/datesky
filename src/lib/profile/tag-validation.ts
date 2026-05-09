/**
 * Profile tag shape validation. Single source of truth for what counts as a
 * valid profile tag, shared between client (TagInput) and server (PUT /api/profile).
 *
 * Public interface: `isValidProfileTag(value)`, `TAG_PATTERN`, `TAG_RULE_DESCRIPTION`.
 * Owner context: Profile bounded context. The lexicon enforces maxGraphemes: 64;
 * this validator narrows further to lowercase alphanumerics and internal hyphens to
 * keep tags useful for overlap matching and free of URL-shaped pollution.
 */

export const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

export const TAG_RULE_DESCRIPTION =
  "lowercase letters, digits, and internal hyphens; 2-64 characters; no URLs, whitespace, dots, or slashes";

export type TagValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Decide whether a candidate tag is acceptable.
 *
 * @param value Candidate tag string. Callers should already have stripped any
 *              leading `#` and trimmed whitespace before calling.
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
      reason: `tag must contain only lowercase letters, digits, and internal hyphens (no URLs, spaces, dots, or slashes)`,
    };
  }
  return { ok: true };
}
