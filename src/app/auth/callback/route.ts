import { NextRequest, NextResponse } from "next/server";
import { Agent } from "@atproto/api";
import { getOAuthClient } from "@/lib/atproto/oauth-client";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const params = new URLSearchParams(req.url.split("?")[1]);
    const client = await getOAuthClient();
    const { session: oauthSession } = await client.callback(params);

    const did = oauthSession.did;

    // Resolve handle from the authenticated session
    const agent = new Agent(oauthSession);
    let handle: string = did;
    try {
      const profile = await agent.getProfile({ actor: did });
      handle = profile.data.handle;
    } catch {
      // Fall back to DID if handle resolution fails
    }

    const session = await getSession();
    session.did = did;
    session.handle = handle;
    await session.save();

    return NextResponse.redirect(new URL("/profile/edit", req.url));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }
}
