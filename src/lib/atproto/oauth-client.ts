import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";
import { getDb } from "../db/index";

let client: NodeOAuthClient | null = null;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (client) return client;

  const db = getDb();
  const publicUrl = process.env.PUBLIC_URL || "https://datesky.app";
  const privateKey = process.env.OAUTH_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("OAUTH_PRIVATE_KEY not set in environment");
  }

  const key = await JoseKey.fromImportable(privateKey, "datesky-key-1");

  client = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${publicUrl}/client-metadata.json`,
      client_name: "DateSky",
      client_uri: publicUrl,
      redirect_uris: [`${publicUrl}/auth/callback`],
      grant_types: ["authorization_code", "refresh_token"],
      scope: "atproto transition:generic",
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      dpop_bound_access_tokens: true,
      jwks_uri: `${publicUrl}/jwks.json`,
    },

    keyset: [key],

    stateStore: {
      async set(key: string, state: NodeSavedState): Promise<void> {
        db.prepare(
          "INSERT OR REPLACE INTO oauth_states (key, state) VALUES (?, ?)"
        ).run(key, JSON.stringify(state));
      },
      async get(key: string): Promise<NodeSavedState | undefined> {
        const row = db
          .prepare("SELECT state FROM oauth_states WHERE key = ?")
          .get(key) as { state: string } | undefined;
        return row ? JSON.parse(row.state) : undefined;
      },
      async del(key: string): Promise<void> {
        db.prepare("DELETE FROM oauth_states WHERE key = ?").run(key);
      },
    },

    sessionStore: {
      async set(sub: string, session: NodeSavedSession): Promise<void> {
        db.prepare(
          "INSERT OR REPLACE INTO oauth_sessions (did, session, updated_at) VALUES (?, ?, datetime('now'))"
        ).run(sub, JSON.stringify(session));
      },
      async get(sub: string): Promise<NodeSavedSession | undefined> {
        const row = db
          .prepare("SELECT session FROM oauth_sessions WHERE did = ?")
          .get(sub) as { session: string } | undefined;
        return row ? JSON.parse(row.session) : undefined;
      },
      async del(sub: string): Promise<void> {
        db.prepare("DELETE FROM oauth_sessions WHERE did = ?").run(sub);
      },
    },
  });

  return client;
}
