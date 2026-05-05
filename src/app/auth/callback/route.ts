import { NextRequest, NextResponse } from "next/server";
import { Agent } from "@atproto/api";
import { getOAuthClient } from "@/lib/atproto/oauth-client";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * True if the OAuth client error reflects the user clicking "Cancel" on
 * their PDS's authorization screen rather than a transport/protocol failure.
 * Source signals: RFC 6749 `error=access_denied` and the @atproto/oauth-client-node
 * normalized message "The user rejected the request".
 */
function isUserCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /reject|access_denied|cancell?ed/i.test(message);
}

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
    if (isUserCancellation(error)) {
      // Not an error condition — user chose not to authorize. Log lightly so
      // the error stream stays useful for genuine failures.
      console.log("OAuth callback: user cancelled authorization");
      return NextResponse.redirect(new URL("/?error=cancelled", req.url));
    }
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }
}
