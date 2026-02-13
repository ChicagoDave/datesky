import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { COLLECTION, RKEY } from "@/lib/atproto/lexicon";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const agent = await getAgent(session.did);
    const response = await agent.com.atproto.repo.getRecord({
      repo: session.did,
      collection: COLLECTION,
      rkey: RKEY,
    });
    return NextResponse.json(response.data.value);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 400 || err.status === 404) {
      return NextResponse.json(null, { status: 404 });
    }
    console.error("Get profile error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const record = await req.json();

    // Validate age if provided
    if (record.age !== undefined && record.age < 18) {
      return NextResponse.json(
        { error: "Must be 18 or older" },
        { status: 400 }
      );
    }

    // Ensure createdAt
    if (!record.createdAt) {
      record.createdAt = new Date().toISOString();
    }

    record.$type = COLLECTION;

    const agent = await getAgent(session.did);
    await agent.com.atproto.repo.putRecord({
      repo: session.did,
      collection: COLLECTION,
      rkey: RKEY,
      record,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Put profile error:", error);
    return NextResponse.json(
      { error: "Failed to save profile" },
      { status: 500 }
    );
  }
}
