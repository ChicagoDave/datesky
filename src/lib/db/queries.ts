import type Database from "better-sqlite3";
import { getDb } from "./index";
import type { NomareProfile } from "../atproto/lexicon";
import { isValidProfileTag } from "../profile/tag-validation";

export interface IndexedProfile {
  did: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  gender: string | null;
  pronouns: string | null;
  age: number | null;
  photos_json: string | null;
  created_at: string | null;
  indexed_at: string;
  tags?: string[];
  intentions?: string[];
}

/**
 * Upsert a profile and its tag/intention sets into the local index.
 *
 * Tags are filtered through `isValidProfileTag` before insertion: tags that
 * fail the shape rule (URLs, whitespace, uppercase, dots, slashes, etc.) are
 * silently dropped. This is defense in depth at the indexer boundary so a
 * Jetstream replay cannot re-pollute `profile_tags` after an operator-run
 * cleanup. The PDS record itself is not mutated — pollution upstream stays
 * upstream until the affected user re-saves through the validated form.
 *
 * Whether the inbound record contained ANY invalid tag is recorded on the
 * `profiles.has_invalid_tags` flag. Browse and match queries exclude flagged
 * profiles, so a polluted user is hidden until they re-save a clean record
 * (which clears the flag automatically on the next upsert).
 *
 * `db` is optional — defaults to the process-wide singleton; pass an explicit
 * handle to drive a test database in isolation.
 */
export function upsertProfile(
  did: string,
  record: NomareProfile,
  handle?: string,
  db: Database.Database = getDb()
) {
  const inboundTags = record.tags ?? [];
  const hasInvalidTags = inboundTags.some(
    (t) => !isValidProfileTag(t).ok
  )
    ? 1
    : 0;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO profiles (did, handle, display_name, bio, location, gender, pronouns, age, photos_json, created_at, indexed_at, raw_record, has_invalid_tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
       ON CONFLICT(did) DO UPDATE SET
         handle=COALESCE(excluded.handle, profiles.handle),
         display_name=excluded.display_name, bio=excluded.bio, location=excluded.location,
         gender=excluded.gender, pronouns=excluded.pronouns, age=excluded.age,
         photos_json=excluded.photos_json, created_at=excluded.created_at,
         indexed_at=datetime('now'), raw_record=excluded.raw_record,
         has_invalid_tags=excluded.has_invalid_tags`
    ).run(
      did,
      handle ?? null,
      record.displayName ?? null,
      record.bio ?? null,
      record.location ?? null,
      record.gender ?? null,
      record.pronouns ?? null,
      record.age ?? null,
      record.photos ? JSON.stringify(record.photos) : null,
      record.createdAt,
      JSON.stringify(record),
      hasInvalidTags
    );

    db.prepare("DELETE FROM profile_tags WHERE did = ?").run(did);
    const insertTag = db.prepare(
      "INSERT INTO profile_tags (did, tag) VALUES (?, ?)"
    );
    for (const tag of inboundTags) {
      if (!isValidProfileTag(tag).ok) continue;
      insertTag.run(did, tag);
    }

    db.prepare("DELETE FROM profile_intentions WHERE did = ?").run(did);
    const insertIntention = db.prepare(
      "INSERT INTO profile_intentions (did, intention) VALUES (?, ?)"
    );
    for (const intention of record.intentions ?? []) {
      insertIntention.run(did, intention);
    }
  })();
}

/**
 * Removes the `profiles` row for the given DID. `profile_tags` and `profile_intentions`
 * cascade automatically per their FOREIGN KEY ... ON DELETE CASCADE clauses in `schema.ts`.
 * `db` is optional — defaults to the process-wide singleton; pass an explicit handle
 * to drive a test database in isolation.
 */
export function deleteProfile(did: string, db: Database.Database = getDb()) {
  db.prepare("DELETE FROM profiles WHERE did = ?").run(did);
}

/**
 * Removes the `user_preferences` row for the given DID. `user_preferences` has no
 * FK to `profiles`, so this must be called explicitly during account deletion to
 * avoid leaving orphaned per-user state. See ADR-0006.
 * `db` is optional — defaults to the process-wide singleton; pass an explicit handle
 * to drive a test database in isolation.
 */
export function deleteUserPreferences(
  did: string,
  db: Database.Database = getDb()
) {
  db.prepare("DELETE FROM user_preferences WHERE did = ?").run(did);
}

/**
 * Update the cached handle for a profile. No-op if the DID has no row yet.
 *
 * `db` is optional — defaults to the process-wide singleton; pass an explicit
 * handle to drive the Jetstream subscriber's separate connection or a test DB.
 */
export function updateHandle(
  did: string,
  handle: string,
  db: Database.Database = getDb()
) {
  db.prepare("UPDATE profiles SET handle = ? WHERE did = ?").run(handle, did);
}

interface BrowseParams {
  tag?: string;
  location?: string;
  intention?: string;
  page?: number;
  limit?: number;
}

export function browseProfiles(
  params: BrowseParams,
  db: Database.Database = getDb()
): {
  profiles: IndexedProfile[];
  total: number;
} {
  const limit = Math.min(params.limit ?? 20, 50);
  const offset = ((params.page ?? 1) - 1) * limit;

  const conditions: string[] = ["p.has_invalid_tags = 0"];
  const values: (string | number)[] = [];

  if (params.tag) {
    conditions.push(
      "p.did IN (SELECT did FROM profile_tags WHERE tag = ?)"
    );
    values.push(params.tag.toLowerCase());
  }

  if (params.location) {
    conditions.push("p.location LIKE ?");
    values.push(`%${params.location}%`);
  }

  if (params.intention) {
    conditions.push(
      "p.did IN (SELECT did FROM profile_intentions WHERE intention = ?)"
    );
    values.push(params.intention);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM profiles p ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `SELECT p.* FROM profiles p ${where} ORDER BY p.indexed_at DESC LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset) as IndexedProfile[];

  // Attach tags and intentions
  const tagStmt = db.prepare(
    "SELECT tag FROM profile_tags WHERE did = ?"
  );
  const intentionStmt = db.prepare(
    "SELECT intention FROM profile_intentions WHERE did = ?"
  );

  for (const row of rows) {
    row.tags = (tagStmt.all(row.did) as { tag: string }[]).map((r) => r.tag);
    row.intentions = (
      intentionStmt.all(row.did) as { intention: string }[]
    ).map((r) => r.intention);
  }

  return { profiles: rows, total: total.count };
}

export function getProfileCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM profiles").get() as {
    count: number;
  };
  return row.count;
}

// OAuth store helpers
export function setOAuthState(key: string, state: string) {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO oauth_states (key, state) VALUES (?, ?)"
  ).run(key, state);
}

export function getOAuthState(key: string): string | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT state FROM oauth_states WHERE key = ?")
    .get(key) as { state: string } | undefined;
  return row?.state;
}

export function deleteOAuthState(key: string) {
  const db = getDb();
  db.prepare("DELETE FROM oauth_states WHERE key = ?").run(key);
}

export function setOAuthSession(did: string, session: string) {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO oauth_sessions (did, session, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(did, session);
}

export function getOAuthSession(did: string): string | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT session FROM oauth_sessions WHERE did = ?")
    .get(did) as { session: string } | undefined;
  return row?.session;
}

/**
 * Removes the OAuth session row for the given DID. Used during sign-out and
 * account deletion to ensure the server cannot resume the session after the
 * client cookie is destroyed.
 * `db` is optional — defaults to the process-wide singleton; pass an explicit handle
 * to drive a test database in isolation.
 */
export function deleteOAuthSession(
  did: string,
  db: Database.Database = getDb()
) {
  db.prepare("DELETE FROM oauth_sessions WHERE did = ?").run(did);
}

// Cursor helpers
export function getCursor(): number | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT cursor_us FROM cursor WHERE id = 1")
    .get() as { cursor_us: number } | undefined;
  return row?.cursor_us;
}

export function saveCursor(cursorUs: number) {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO cursor (id, cursor_us) VALUES (1, ?)"
  ).run(cursorUs);
}

// User preferences (private, per-DID — see ADR 0001)
export type MatchIntent = "dating" | "friendship" | "both";

export interface UserPreferences {
  show_photos: boolean;
  compact_view: boolean;
  match_mode_enabled: boolean;
  match_intent: MatchIntent;
  dating_age_min: number | null;
  dating_age_max: number | null;
  friendship_age_min: number | null;
  friendship_age_max: number | null;
  gender_preferences: string[];
  location_filter: string | null;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  show_photos: true,
  compact_view: false,
  match_mode_enabled: false,
  match_intent: "dating",
  dating_age_min: 25,
  dating_age_max: 45,
  friendship_age_min: 18,
  friendship_age_max: 99,
  gender_preferences: [],
  location_filter: null,
};

interface UserPreferencesRow {
  show_photos: number;
  compact_view: number;
  match_mode_enabled: number;
  match_intent: string;
  dating_age_min: number | null;
  dating_age_max: number | null;
  friendship_age_min: number | null;
  friendship_age_max: number | null;
  gender_preferences: string;
  location_filter: string | null;
}

function rowToPrefs(row: UserPreferencesRow): UserPreferences {
  let genderPrefs: string[] = [];
  try {
    const parsed = JSON.parse(row.gender_preferences);
    if (Array.isArray(parsed)) {
      genderPrefs = parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // malformed JSON in DB — fall back to empty
  }
  const intent: MatchIntent =
    row.match_intent === "friendship" || row.match_intent === "both"
      ? row.match_intent
      : "dating";
  return {
    show_photos: row.show_photos === 1,
    compact_view: row.compact_view === 1,
    match_mode_enabled: row.match_mode_enabled === 1,
    match_intent: intent,
    dating_age_min: row.dating_age_min,
    dating_age_max: row.dating_age_max,
    friendship_age_min: row.friendship_age_min,
    friendship_age_max: row.friendship_age_max,
    gender_preferences: genderPrefs,
    location_filter: row.location_filter,
  };
}

/**
 * Look up a viewer's stored preferences.
 * Returns DEFAULT_PREFERENCES when no row exists.
 */
export function getUserPreferences(did: string): UserPreferences {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT show_photos, compact_view, match_mode_enabled, match_intent,
              dating_age_min, dating_age_max, friendship_age_min, friendship_age_max,
              gender_preferences, location_filter
         FROM user_preferences WHERE did = ?`
    )
    .get(did) as UserPreferencesRow | undefined;
  if (!row) return DEFAULT_PREFERENCES;
  return rowToPrefs(row);
}

/**
 * Upsert a viewer's preferences. Booleans coerced to 0/1, gender_preferences serialized as JSON.
 * Refreshes updated_at on every write.
 */
export function setUserPreferences(
  did: string,
  prefs: UserPreferences
): UserPreferences {
  const db = getDb();
  db.prepare(
    `INSERT INTO user_preferences (
       did, show_photos, compact_view, match_mode_enabled, match_intent,
       dating_age_min, dating_age_max, friendship_age_min, friendship_age_max,
       gender_preferences, location_filter, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(did) DO UPDATE SET
       show_photos = excluded.show_photos,
       compact_view = excluded.compact_view,
       match_mode_enabled = excluded.match_mode_enabled,
       match_intent = excluded.match_intent,
       dating_age_min = excluded.dating_age_min,
       dating_age_max = excluded.dating_age_max,
       friendship_age_min = excluded.friendship_age_min,
       friendship_age_max = excluded.friendship_age_max,
       gender_preferences = excluded.gender_preferences,
       location_filter = excluded.location_filter,
       updated_at = datetime('now')`
  ).run(
    did,
    prefs.show_photos ? 1 : 0,
    prefs.compact_view ? 1 : 0,
    prefs.match_mode_enabled ? 1 : 0,
    prefs.match_intent,
    prefs.dating_age_min,
    prefs.dating_age_max,
    prefs.friendship_age_min,
    prefs.friendship_age_max,
    JSON.stringify(prefs.gender_preferences),
    prefs.location_filter
  );
  return prefs;
}

/**
 * Pull every indexed profile (with tags and intentions attached) except the viewer.
 * Used as the candidate pool for match mode — filtering and scoring happens in src/lib/match.
 */
export function getMatchCandidates(
  viewerDid: string,
  db: Database.Database = getDb()
): IndexedProfile[] {
  const rows = db
    .prepare(
      "SELECT * FROM profiles WHERE did != ? AND has_invalid_tags = 0"
    )
    .all(viewerDid) as IndexedProfile[];

  const tagStmt = db.prepare("SELECT tag FROM profile_tags WHERE did = ?");
  const intentionStmt = db.prepare(
    "SELECT intention FROM profile_intentions WHERE did = ?"
  );
  for (const row of rows) {
    row.tags = (tagStmt.all(row.did) as { tag: string }[]).map((r) => r.tag);
    row.intentions = (
      intentionStmt.all(row.did) as { intention: string }[]
    ).map((r) => r.intention);
  }
  return rows;
}

/**
 * Look up the viewer's own tags. Used as the comparison set when scoring tag overlap.
 */
export function getProfileTags(did: string): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT tag FROM profile_tags WHERE did = ?")
    .all(did) as { tag: string }[];
  return rows.map((r) => r.tag);
}

/**
 * Pull the list of invalid tags currently sitting in this DID's PDS record.
 *
 * Reads `raw_record` (the verbatim JSON that came from the user's PDS at last
 * Jetstream/index event) and runs each tag through `isValidProfileTag`. Used
 * by the site-wide invalid-tags banner to name the offending tags so the user
 * knows what to remove. Returns an empty array when the row is missing, when
 * `raw_record` is null/malformed, or when every tag passes validation.
 *
 * `db` is optional — defaults to the process-wide singleton.
 */
export function getInvalidTagsForDid(
  did: string,
  db: Database.Database = getDb()
): string[] {
  const row = db
    .prepare("SELECT raw_record FROM profiles WHERE did = ?")
    .get(did) as { raw_record: string | null } | undefined;
  if (!row?.raw_record) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.raw_record);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const tags = (parsed as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter(
    (t): t is string => typeof t === "string" && !isValidProfileTag(t).ok
  );
}
