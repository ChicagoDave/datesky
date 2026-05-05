import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/atproto/oauth-client";

export const runtime = "nodejs";

/**
 * Normalize a user-typed handle for OAuth resolution.
 * Strips a single leading `@` (Twitter muscle memory) and trims whitespace.
 * Does NOT rewrite domains or append `.bsky.social` — those would be guesses
 * about which PDS the user belongs to and could route them to the wrong host.
 */
function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "");
}

/**
 * Translate an OAuth client resolution error into a user-facing message.
 * Returns null if the error is not a recognized resolution failure.
 */
function explainResolutionError(err: unknown, handle: string): string | null {
  const cause = (err as { cause?: { message?: string } } | undefined)?.cause;
  const causeMsg = cause?.message ?? "";

  if (causeMsg.startsWith("Invalid handle")) {
    if (handle.includes("@")) {
      return `That handle isn't valid. Use dots, not "@" — e.g. "you.bsky.social", not "you@bsky.social".`;
    }
    if (!handle.includes(".")) {
      return `That handle isn't valid. Include the full domain — e.g. "you.bsky.social".`;
    }
    return `That handle isn't a valid format. Use the full atproto handle, e.g. "you.bsky.social".`;
  }

  if (causeMsg.includes("does not resolve to a DID")) {
    return `We couldn't find "${handle}" on the network. Double-check the spelling — common mistake: ".bsky.app" should be ".bsky.social".`;
  }

  return null;
}

export async function POST(req: NextRequest) {
  let handle: string | undefined;
  try {
    const body = await req.json();
    handle = typeof body.handle === "string" ? normalizeHandle(body.handle) : undefined;

    if (!handle) {
      return NextResponse.json(
        { error: "Please enter your atproto handle." },
        { status: 400 }
      );
    }

    const client = await getOAuthClient();
    const url = await client.authorize(handle, {
      scope: "atproto transition:generic",
    });

    return NextResponse.json({ url: url.toString() });
  } catch (error) {
    console.error("OAuth login error:", error);

    const friendly = handle ? explainResolutionError(error, handle) : null;
    if (friendly) {
      return NextResponse.json({ error: friendly }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Something went wrong starting sign-in. Please try again." },
      { status: 500 }
    );
  }
}
