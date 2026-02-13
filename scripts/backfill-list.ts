import Database from "better-sqlite3";
import path from "path";
import { initSchema } from "../src/lib/db/schema";
import { getAgent } from "../src/lib/atproto/agent";
import { ListManager } from "../src/lib/atproto/list-manager";

const DB_PATH = path.join(process.cwd(), "data", "datesky.db");
const LIST_OWNER_DID = process.env.DATESKY_LIST_OWNER_DID;
const LIST_URI = process.env.DATESKY_LIST_URI;

async function main() {
  if (!LIST_OWNER_DID || !LIST_URI) {
    console.error("Missing DATESKY_LIST_OWNER_DID or DATESKY_LIST_URI in env");
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);

  const rows = db.prepare("SELECT did FROM profiles").all() as {
    did: string;
  }[];
  console.log(`Found ${rows.length} profiles in database`);

  console.log(`Restoring agent for list owner: ${LIST_OWNER_DID}`);
  const agent = await getAgent(LIST_OWNER_DID);
  const listManager = new ListManager(agent, LIST_URI, LIST_OWNER_DID);

  console.log("Fetching existing list members...");
  const existing = await listManager.getExistingMembers();
  console.log(`List currently has ${existing.size} members`);

  const toAdd = rows
    .map((r) => r.did)
    .filter((did) => !existing.has(did));
  console.log(`${toAdd.length} profiles need to be added`);

  let added = 0;
  let errors = 0;

  for (const did of toAdd) {
    try {
      await listManager.addMember(did);
      added++;
      console.log(`[${added}/${toAdd.length}] Added ${did}`);

      if (added % 50 === 0) {
        console.log("Pausing 5s for rate limits...");
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (err: any) {
      errors++;
      console.error(`Failed to add ${did}:`, err?.message ?? err);
      if (err?.status === 429) {
        console.log("Rate limited — waiting 60s...");
        await new Promise((r) => setTimeout(r, 60000));
      }
    }
  }

  console.log(`\nBackfill complete: ${added} added, ${errors} errors`);
  db.close();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
