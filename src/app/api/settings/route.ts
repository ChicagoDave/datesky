/**
 * Read and update the viewer's private preferences.
 *
 * Public interface: GET returns current prefs (or defaults); POST upserts and returns the new prefs.
 * Owner context: settings UI for the authenticated viewer.
 *
 * Per ADR 0001, these preferences are private to Nomare's database and must never
 * be written to the user's PDS. Both handlers reject unauthenticated callers.
 *
 * POST applies these invariants before persisting (ADR 0001 §"Age range floors"):
 *   - Hard floor of 18 on both dating and friendship age ranges
 *   - Age min must be <= age max within a range
 *   - match_intent must be one of: "dating" | "friendship" | "both"
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getUserPreferences,
  setUserPreferences,
  type MatchIntent,
  type UserPreferences,
} from "@/lib/db/queries";

export const runtime = "nodejs";

const AGE_FLOOR = 18;
const AGE_CEILING = 120;
const VALID_INTENTS: ReadonlySet<MatchIntent> = new Set([
  "dating",
  "friendship",
  "both",
]);

export async function GET() {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const prefs = getUserPreferences(session.did);
  return NextResponse.json(prefs);
}

interface IncomingPrefs {
  show_photos?: unknown;
  compact_view?: unknown;
  match_mode_enabled?: unknown;
  match_intent?: unknown;
  dating_age_min?: unknown;
  dating_age_max?: unknown;
  friendship_age_min?: unknown;
  friendship_age_max?: unknown;
  gender_preferences?: unknown;
  location_filter?: unknown;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function coerceAge(
  value: unknown,
  fallback: number | null
): number | null | "INVALID" {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return "INVALID";
  if (n < AGE_FLOOR || n > AGE_CEILING) return "INVALID";
  return n;
}

function coerceIntent(value: unknown, fallback: MatchIntent): MatchIntent | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return null;
  if (!VALID_INTENTS.has(value as MatchIntent)) return null;
  return value as MatchIntent;
}

function coerceGenderPreferences(
  value: unknown,
  fallback: string[]
): string[] | null {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") return null;
    const trimmed = v.trim().toLowerCase();
    if (trimmed.length === 0) continue;
    if (trimmed.length > 64) return null;
    if (!result.includes(trimmed)) result.push(trimmed);
  }
  return result;
}

function coerceLocation(
  value: unknown,
  fallback: string | null
): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, 200);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: IncomingPrefs;
  try {
    body = (await req.json()) as IncomingPrefs;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = getUserPreferences(session.did);

  const datingMin = coerceAge(body.dating_age_min, current.dating_age_min);
  const datingMax = coerceAge(body.dating_age_max, current.dating_age_max);
  const friendshipMin = coerceAge(
    body.friendship_age_min,
    current.friendship_age_min
  );
  const friendshipMax = coerceAge(
    body.friendship_age_max,
    current.friendship_age_max
  );

  if (
    datingMin === "INVALID" ||
    datingMax === "INVALID" ||
    friendshipMin === "INVALID" ||
    friendshipMax === "INVALID"
  ) {
    return NextResponse.json(
      { error: `Age values must be between ${AGE_FLOOR} and ${AGE_CEILING}.` },
      { status: 400 }
    );
  }

  if (datingMin != null && datingMax != null && datingMin > datingMax) {
    return NextResponse.json(
      { error: "Dating age min cannot exceed dating age max." },
      { status: 400 }
    );
  }
  if (
    friendshipMin != null &&
    friendshipMax != null &&
    friendshipMin > friendshipMax
  ) {
    return NextResponse.json(
      { error: "Friendship age min cannot exceed friendship age max." },
      { status: 400 }
    );
  }

  const intent = coerceIntent(body.match_intent, current.match_intent);
  if (intent === null) {
    return NextResponse.json(
      { error: "match_intent must be 'dating', 'friendship', or 'both'." },
      { status: 400 }
    );
  }

  const genderPrefs = coerceGenderPreferences(
    body.gender_preferences,
    current.gender_preferences
  );
  if (genderPrefs === null) {
    return NextResponse.json(
      { error: "gender_preferences must be an array of strings (max 64 chars each)." },
      { status: 400 }
    );
  }

  const next: UserPreferences = {
    show_photos: coerceBoolean(body.show_photos, current.show_photos),
    compact_view: coerceBoolean(body.compact_view, current.compact_view),
    match_mode_enabled: coerceBoolean(
      body.match_mode_enabled,
      current.match_mode_enabled
    ),
    match_intent: intent,
    dating_age_min: datingMin,
    dating_age_max: datingMax,
    friendship_age_min: friendshipMin,
    friendship_age_max: friendshipMax,
    gender_preferences: genderPrefs,
    location_filter: coerceLocation(body.location_filter, current.location_filter),
  };

  setUserPreferences(session.did, next);
  return NextResponse.json(next);
}
