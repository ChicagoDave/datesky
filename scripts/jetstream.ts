import WebSocket from "ws";
import Database from "better-sqlite3";
import path from "path";
import { initSchema } from "../src/lib/db/schema";
import {
  upsertProfile,
  deleteProfile,
  updateHandle,
} from "../src/lib/db/queries";
import {
  COLLECTION,
  LEGACY_COLLECTION,
  type NomareProfile,
} from "../src/lib/atproto/lexicon";
import { getAgent } from "../src/lib/atproto/agent";
import { ListManager } from "../src/lib/atproto/list-manager";

// Subscribed collections — canonical NSID and the legacy NSID during the dual-publish
// transition (ADR-0003). The local `profiles` table is DID-keyed, so events from either
// collection upsert into the same row idempotently.
const SUBSCRIBED_COLLECTIONS = new Set<string>([COLLECTION, LEGACY_COLLECTION]);
const JETSTREAM_URL = "wss://jetstream2.us-east.bsky.network/subscribe";
const CURSOR_SAVE_INTERVAL = 100; // Save cursor every N events

const DB_PATH = path.join(process.cwd(), "data", "nomare.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
initSchema(db);

const LIST_OWNER_DID = process.env.DATESKY_LIST_OWNER_DID;
const LIST_URI = process.env.DATESKY_LIST_URI;

let eventCount = 0;
let reconnectDelay = 1000;
let listManager: ListManager | null = null;

// Cursor management is jetstream-local — keeping it inline so the reconnect
// loop and shutdown handler can read/write without funneling through the
// queries.ts singleton (jetstream owns its own DB connection per process).
const getCursorStmt = db.prepare(
  "SELECT cursor_us FROM cursor WHERE id = 1"
);
const saveCursorStmt = db.prepare(
  "INSERT OR REPLACE INTO cursor (id, cursor_us) VALUES (1, ?)"
);

interface JetstreamEvent {
  kind: string;
  did: string;
  time_us: number;
  commit?: {
    collection: string;
    operation: string;
    rkey: string;
    record?: NomareProfile;
  };
  identity?: {
    handle?: string;
  };
}

async function resolveHandle(did: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) return undefined;
    const doc = await res.json();
    const aka = doc.alsoKnownAs?.find((a: string) => a.startsWith("at://"));
    return aka?.replace("at://", "");
  } catch {
    return undefined;
  }
}

async function handleEvent(event: JetstreamEvent) {
  if (
    event.kind === "commit" &&
    event.commit?.collection !== undefined &&
    SUBSCRIBED_COLLECTIONS.has(event.commit.collection)
  ) {
    const { did } = event;
    const { operation, record } = event.commit;

    if ((operation === "create" || operation === "update") && record) {
      const handle = await resolveHandle(did);
      console.log(`[${operation}] ${did} (${handle ?? "unknown handle"})`);
      upsertProfile(did, record, handle, db);

      if (operation === "create" && listManager) {
        try {
          await listManager.addMember(did);
          console.log(`[list] Added ${did}`);
        } catch (err: any) {
          console.error(`[list] Failed to add ${did}:`, err?.message ?? err);
        }
      }
    } else if (operation === "delete") {
      console.log(`[delete] ${did}`);
      deleteProfile(did, db);

      if (listManager) {
        try {
          const removed = await listManager.removeMemberByDid(did);
          if (removed) console.log(`[list] Removed ${did}`);
        } catch (err: any) {
          console.error(`[list] Failed to remove ${did}:`, err?.message ?? err);
        }
      }
    }
  } else if (event.kind === "identity" && event.identity?.handle) {
    updateHandle(event.did, event.identity.handle, db);
  }

  eventCount++;
  if (eventCount % CURSOR_SAVE_INTERVAL === 0) {
    saveCursorStmt.run(event.time_us);
  }
}

function connect() {
  const cursor = getCursorStmt.get() as { cursor_us: number } | undefined;

  const url = new URL(JETSTREAM_URL);
  // Jetstream's wantedCollections accepts the parameter multiple times to subscribe
  // to multiple collections. Subscribe to both NSIDs during the dual-publish window.
  url.searchParams.append("wantedCollections", COLLECTION);
  url.searchParams.append("wantedCollections", LEGACY_COLLECTION);
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

  ws.on("message", async (data) => {
    try {
      const event: JetstreamEvent = JSON.parse(data.toString());
      await handleEvent(event);
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

async function initListManager(): Promise<void> {
  if (!LIST_OWNER_DID || !LIST_URI) {
    console.warn("List env vars not set — list management disabled");
    return;
  }
  try {
    const agent = await getAgent(LIST_OWNER_DID);
    listManager = new ListManager(agent, LIST_URI, LIST_OWNER_DID);
    console.log("List manager initialized for auto-sync");
  } catch (err: any) {
    console.error("Failed to init list manager:", err?.message ?? err);
    console.warn("List management disabled for this session");
  }
}

// Start
console.log("Nomare Jetstream subscriber starting...");
initListManager().then(() => connect());
