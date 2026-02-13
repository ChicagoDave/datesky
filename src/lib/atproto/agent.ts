import { Agent } from "@atproto/api";
import { getOAuthClient } from "./oauth-client";

export async function getAgent(did: string): Promise<Agent> {
  const client = await getOAuthClient();
  const session = await client.restore(did);
  return new Agent(session);
}
