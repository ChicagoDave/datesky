import { getDb } from "./index";
import type { DateSkyProfile } from "../atproto/lexicon";

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
  record: DateSkyProfile,
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

export function deleteProfile(did: string) {
  const db = getDb();
  db.prepare("DELETE FROM profiles WHERE did = ?").run(did);
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

export function deleteOAuthSession(did: string) {
  const db = getDb();
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
