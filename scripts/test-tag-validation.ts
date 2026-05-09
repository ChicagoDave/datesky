/**
 * Real-path unit tests for `isValidProfileTag` and `normalizeTag`.
 *
 * Run: `npx tsx scripts/test-tag-validation.ts`
 *
 * Covers each REJECTS WHEN clause from the validator's Behavior Statement plus
 * the happy paths, plus the normalization rules that fix user-formatting noise
 * (whitespace, casing, leading '#', adjacent hyphens) before validation.
 * Pure-function tests — no DB, no network.
 */
import {
  isValidProfileTag,
  normalizeTag,
} from "../src/lib/profile/tag-validation";

let passed = 0;
let failed = 0;

function expectOk(input: string) {
  const result = isValidProfileTag(input);
  if (result.ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: expected ok for ${JSON.stringify(input)}, got reason: ${result.reason}`);
  }
}

function expectReject(input: string, expectedReasonSubstring: string) {
  const result = isValidProfileTag(input);
  if (result.ok) {
    failed++;
    console.error(`FAIL: expected reject for ${JSON.stringify(input)}, got ok`);
    return;
  }
  if (!result.reason.includes(expectedReasonSubstring)) {
    failed++;
    console.error(
      `FAIL: reject for ${JSON.stringify(input)} had reason ${JSON.stringify(result.reason)}, expected substring ${JSON.stringify(expectedReasonSubstring)}`
    );
    return;
  }
  passed++;
}

// Happy path
expectOk("hiking");
expectOk("dog-parent");
expectOk("polyam");
expectOk("portland");
expectOk("queer");
expectOk("a1");
expectOk("123");
expectOk("a-b-c-d");
expectOk("a".repeat(64));

// URL-shaped pollution (the reason for this work)
expectReject("https://example.com", "lowercase letters, digits");
expectReject("http://foo.bar", "lowercase letters, digits");
expectReject("www.example.com", "lowercase letters, digits");
expectReject("example.com", "lowercase letters, digits");
expectReject("foo/bar", "lowercase letters, digits");
expectReject("foo:bar", "lowercase letters, digits");

// Whitespace
expectReject("dog parent", "lowercase letters, digits");
expectReject("hiking ", "lowercase letters, digits");
expectReject(" hiking", "lowercase letters, digits");
expectReject("a\tb", "lowercase letters, digits");

// Dots and other punctuation that look URL-ish
expectReject("node.js", "lowercase letters, digits");
expectReject("c++", "lowercase letters, digits");
expectReject("hello!", "lowercase letters, digits");
expectReject("hello?", "lowercase letters, digits");
expectReject("emoji😀", "lowercase letters, digits");
expectReject("a@b", "lowercase letters, digits");
expectReject("under_score", "lowercase letters, digits");

// Uppercase
expectReject("Hiking", "lowercase");
expectReject("HIKING", "lowercase");
expectReject("Dog-Parent", "lowercase");

// Length boundaries
expectReject("", "at least 2");
expectReject("a", "at least 2");
expectReject("a".repeat(65), "at most 64");

// Hyphen edges
expectReject("-foo", "lowercase letters, digits");
expectReject("foo-", "lowercase letters, digits");
expectReject("--", "lowercase letters, digits");

// Type guard
// @ts-expect-error — intentional bad input to test runtime guard
expectReject(null, "must be a string");
// @ts-expect-error — intentional bad input
expectReject(123, "must be a string");

// ---- normalizeTag ----
// User-formatting noise (whitespace, casing, leading '#') normalizes away
// rather than counting as pollution. After normalization, the result feeds
// `isValidProfileTag` — which still rejects URLs, dots, slashes, etc.

function expectNormalize(input: unknown, expected: string) {
  const got = normalizeTag(input);
  if (got === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `FAIL: normalizeTag(${JSON.stringify(input)}) -> ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`
    );
  }
}

// Identity for already-clean tags
expectNormalize("hiking", "hiking");
expectNormalize("dog-parent", "dog-parent");
expectNormalize("a1", "a1");

// Lowercasing
expectNormalize("Hiking", "hiking");
expectNormalize("HIKING", "hiking");
expectNormalize("Dog-Parent", "dog-parent");

// Leading '#' stripped
expectNormalize("#hiking", "hiking");
expectNormalize("##hiking", "#hiking"); // only ONE leading # is stripped — second # then makes it invalid downstream
// (validator will reject "#hiking" because '#' is not in the allowed pattern; that's correct)

// Surrounding whitespace trimmed
expectNormalize("  hiking  ", "hiking");
expectNormalize("\thiking\n", "hiking");

// Internal whitespace runs collapse to a single hyphen
expectNormalize("dog parent", "dog-parent");
expectNormalize("dog  parent", "dog-parent");
expectNormalize("data science", "data-science");
expectNormalize("a\tb", "a-b");
expectNormalize("a\nb", "a-b");
expectNormalize("a b c", "a-b-c");

// Adjacent hyphens collapse to one
expectNormalize("dog--parent", "dog-parent");
expectNormalize("dog---parent", "dog-parent");

// Leading/trailing hyphens trimmed (after whitespace collapse)
expectNormalize("-hiking", "hiking");
expectNormalize("hiking-", "hiking");
expectNormalize("---hiking---", "hiking");
expectNormalize(" - hiking - ", "hiking");

// Whitespace-only or non-string yields empty
expectNormalize("", "");
expectNormalize("   ", "");
expectNormalize("\t\n", "");
expectNormalize(null, "");
expectNormalize(undefined, "");
expectNormalize(123, "");

// Idempotence
{
  const inputs = ["Dog Parent", "  #hiking  ", "data   science", "a--b"];
  for (const x of inputs) {
    const once = normalizeTag(x);
    const twice = normalizeTag(once);
    if (once === twice) {
      passed++;
    } else {
      failed++;
      console.error(
        `FAIL: normalizeTag not idempotent for ${JSON.stringify(x)}: once=${JSON.stringify(once)}, twice=${JSON.stringify(twice)}`
      );
    }
  }
}

// After normalization, formerly-invalid space/case strings become valid
{
  const cases: [string, string][] = [
    ["dog parent", "dog-parent"],
    ["Dog Parent", "dog-parent"],
    ["#HIKING", "hiking"],
    ["data science", "data-science"],
  ];
  for (const [raw, normalized] of cases) {
    const result = isValidProfileTag(normalizeTag(raw));
    if (result.ok) {
      passed++;
    } else {
      failed++;
      console.error(
        `FAIL: ${JSON.stringify(raw)} -> ${JSON.stringify(normalized)} should be valid post-normalize, got reason: ${result.reason}`
      );
    }
  }
}

// URLs/dots/slashes still invalid even after normalization
{
  const stillInvalid = [
    "https://example.com",
    "http://foo.bar",
    "node.js",
    "foo/bar",
    "foo:bar",
    "  https://spam.example  ",
    "#https://spam.example",
  ];
  for (const x of stillInvalid) {
    const result = isValidProfileTag(normalizeTag(x));
    if (!result.ok) {
      passed++;
    } else {
      failed++;
      console.error(
        `FAIL: ${JSON.stringify(x)} should still be invalid post-normalize`
      );
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
