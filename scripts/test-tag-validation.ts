/**
 * Real-path unit tests for `isValidProfileTag`.
 *
 * Run: `npx tsx scripts/test-tag-validation.ts`
 *
 * Covers each REJECTS WHEN clause from the validator's Behavior Statement plus
 * the happy paths. Pure-function tests — no DB, no network.
 */
import { isValidProfileTag } from "../src/lib/profile/tag-validation";

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
