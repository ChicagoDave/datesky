import type Database from "better-sqlite3";
import { getDb } from "./index";
import type { NomareProfile } from "../atproto/lexicon";

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

export function upsertProfile(
  did: string,
  record: NomareProfile,
  handle?: string
) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO profiles (did, handle, display_name, bio, location, gender, pronouns, age, photos_json, created_at, indexed_at, raw_record)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(did) DO UPDATE SET
         handle=COALESCE(excluded.handle, profiles.handle),
         display_name=excluded.display_name, bio=excluded.bio, location=excluded.location,
         gender=excluded.gender, pronouns=excluded.pronouns, age=excluded.age,
         photos_json=excluded.photos_json, created_at=excluded.created_at,
         indexed_at=datetime('now'), raw_record=excluded.raw_record`
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
      JSON.stringify(record)
    );

    db.prepare("DELETE FROM profile_tags WHERE did = ?").run(did);
    const insertTag = db.prepare(
      "INSERT INTO profile_tags (did, tag) VALUES (?, ?)"
    );
    for (const tag of record.tags ?? []) {
      insertTag.run(did, tag.toLowerCase());
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

export function updateHandle(did: string, handle: string) {
  const db = getDb();
  db.prepare("UPDATE profiles SET handle = ? WHERE did = ?").run(handle, did);
}

interface BrowseParams {
  tag?: string;
  location?: string;
  intention?: string;
  page?: number;
  limit?: number;
}

export function browseProfiles(params: BrowseParams): {
  profiles: IndexedProfile[];
  total: number;
} {
  const db = getDb();
  const limit = Math.min(params.limit ?? 20, 50);
  const offset = ((params.page ?? 1) - 1) * limit;

  const conditions: string[] = [];
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
export function getMatchCandidates(viewerDid: string): IndexedProfile[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM profiles WHERE did != ?")
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
