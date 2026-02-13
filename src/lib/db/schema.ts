import type Database from "better-sqlite3";

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
      raw_record TEXT
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
  `);
}
