import WebSocket from "ws";
import Database from "better-sqlite3";
import path from "path";
import { initSchema } from "../src/lib/db/schema";
import type { DateSkyProfile } from "../src/lib/atproto/lexicon";

const COLLECTION = "app.datesky.profile";
const JETSTREAM_URL = "wss://jetstream2.us-east.bsky.network/subscribe";
const CURSOR_SAVE_INTERVAL = 100; // Save cursor every N events

const DB_PATH = path.join(process.cwd(), "data", "datesky.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
initSchema(db);

let eventCount = 0;
let reconnectDelay = 1000;

// Prepared statements
const upsertProfile = db.prepare(`
  INSERT INTO profiles (did, handle, display_name, bio, location, gender, pronouns, age, photos_json, created_at, indexed_at, raw_record)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  ON CONFLICT(did) DO UPDATE SET
    handle=COALESCE(excluded.handle, profiles.handle),
    display_name=excluded.display_name, bio=excluded.bio, location=excluded.location,
    gender=excluded.gender, pronouns=excluded.pronouns, age=excluded.age,
    photos_json=excluded.photos_json, created_at=excluded.created_at,
    indexed_at=datetime('now'), raw_record=excluded.raw_record
`);
const deleteTags = db.prepare("DELETE FROM profile_tags WHERE did = ?");
const insertTag = db.prepare(
  "INSERT INTO profile_tags (did, tag) VALUES (?, ?)"
);
const deleteIntentions = db.prepare(
  "DELETE FROM profile_intentions WHERE did = ?"
);
const insertIntention = db.prepare(
  "INSERT INTO profile_intentions (did, intention) VALUES (?, ?)"
);
const deleteProfileStmt = db.prepare("DELETE FROM profiles WHERE did = ?");
const updateHandleStmt = db.prepare(
  "UPDATE profiles SET handle = ? WHERE did = ?"
);
const getCursorStmt = db.prepare(
  "SELECT cursor_us FROM cursor WHERE id = 1"
);
const saveCursorStmt = db.prepare(
  "INSERT OR REPLACE INTO cursor (id, cursor_us) VALUES (1, ?)"
);

const upsertTransaction = db.transaction(
  (did: string, record: DateSkyProfile, handle?: string) => {
    upsertProfile.run(
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

    deleteTags.run(did);
    for (const tag of record.tags ?? []) {
      insertTag.run(did, tag.toLowerCase());
    }

    deleteIntentions.run(did);
    for (const intention of record.intentions ?? []) {
      insertIntention.run(did, intention);
    }
  }
);

interface JetstreamEvent {
  kind: string;
  did: string;
  time_us: number;
  commit?: {
    collection: string;
    operation: string;
    rkey: string;
    record?: DateSkyProfile;
  };
  identity?: {
    handle?: string;
  };
}

function handleEvent(event: JetstreamEvent) {
  if (event.kind === "commit" && event.commit?.collection === COLLECTION) {
    const { did } = event;
    const { operation, record } = event.commit;

    if ((operation === "create" || operation === "update") && record) {
      console.log(`[${operation}] ${did}`);
      upsertTransaction(did, record);
    } else if (operation === "delete") {
      console.log(`[delete] ${did}`);
      deleteProfileStmt.run(did);
    }
  } else if (event.kind === "identity" && event.identity?.handle) {
    updateHandleStmt.run(event.identity.handle, event.did);
  }

  eventCount++;
  if (eventCount % CURSOR_SAVE_INTERVAL === 0) {
    saveCursorStmt.run(event.time_us);
  }
}

function connect() {
  const cursor = getCursorStmt.get() as { cursor_us: number } | undefined;

  const url = new URL(JETSTREAM_URL);
  url.searchParams.set("wantedCollections", COLLECTION);
  if (cursor) {
    url.searchParams.set("cursor", cursor.cursor_us.toString());
    console.log(`Resuming from cursor: ${cursor.cursor_us}`);
  }

  console.log(`Connecting to Jetstream...`);
  const ws = new WebSocket(url.toString());

  ws.on("open", () => {
    console.log("Connected to Jetstream");
    reconnectDelay = 1000; // Reset backoff on successful connect
  });

  ws.on("message", (data) => {
    try {
      const event: JetstreamEvent = JSON.parse(data.toString());
      handleEvent(event);
    } catch (err) {
      console.error("Failed to parse event:", err);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(
      `Disconnected (code: ${code}, reason: ${reason.toString()}). Reconnecting in ${reconnectDelay / 1000}s...`
    );
    // Save cursor before reconnect
    const lastCursor = getCursorStmt.get() as
      | { cursor_us: number }
      | undefined;
    if (lastCursor) {
      saveCursorStmt.run(lastCursor.cursor_us);
    }
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    ws.close();
  });
}

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  const cursor = getCursorStmt.get() as { cursor_us: number } | undefined;
  if (cursor) {
    saveCursorStmt.run(cursor.cursor_us);
    console.log(`Saved cursor: ${cursor.cursor_us}`);
  }
  db.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start
console.log("DateSky Jetstream subscriber starting...");
connect();
