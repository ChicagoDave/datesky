import type Database from "better-sqlite3";

/**
 * Idempotent: safe to call on every process start.
 *
 * `has_invalid_tags` is added defensively for databases created before the
 * flag existed. SQLite has no `ADD COLUMN IF NOT EXISTS`, so we probe with
 * pragma_table_info and ALTER only when missing. New databases get the column
 * via the CREATE TABLE statement below.
 */
export function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      did TEXT PRIMARY KEY,
      handle TEXT,
      display_name TEXT,
      bio TEXT,
      location TEXT,
      gender TEXT,
      pronouns TEXT,
      age INTEGER,
      photos_json TEXT,
      created_at TEXT,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      raw_record TEXT,
      has_invalid_tags INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile_tags (
      did TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (did, tag),
      FOREIGN KEY (did) REFERENCES profiles(did) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_intentions (
      did TEXT NOT NULL,
      intention TEXT NOT NULL,
      PRIMARY KEY (did, intention),
      FOREIGN KEY (did) REFERENCES profiles(did) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(location);
    CREATE INDEX IF NOT EXISTS idx_profiles_age ON profiles(age);
    CREATE INDEX IF NOT EXISTS idx_profile_tags_tag ON profile_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_profile_intentions_intention ON profile_intentions(intention);

    CREATE TABLE IF NOT EXISTS oauth_states (
      key TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_sessions (
      did TEXT PRIMARY KEY,
      session TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cursor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cursor_us INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      did TEXT PRIMARY KEY,
      show_photos INTEGER NOT NULL DEFAULT 1,
      compact_view INTEGER NOT NULL DEFAULT 0,
      match_mode_enabled INTEGER NOT NULL DEFAULT 0,
      match_intent TEXT NOT NULL DEFAULT 'dating',
      dating_age_min INTEGER,
      dating_age_max INTEGER,
      friendship_age_min INTEGER,
      friendship_age_max INTEGER,
      gender_preferences TEXT NOT NULL DEFAULT '[]',
      location_filter TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const cols = db
    .prepare("PRAGMA table_info(profiles)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "has_invalid_tags")) {
    db.exec(
      "ALTER TABLE profiles ADD COLUMN has_invalid_tags INTEGER NOT NULL DEFAULT 0"
    );
  }
}
