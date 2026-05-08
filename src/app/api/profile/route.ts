/**
 * Read and write the authenticated viewer's own profile record.
 *
 * Public interface: GET returns the viewer's profile (trying the canonical NSID first,
 * falling back to the legacy NSID per ADR-0003); PUT writes the canonical record and then
 * a legacy mirror for dual-publish during the transition window.
 * Owner context: Profile bounded context — write path for the authenticated user.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";
import { COLLECTION, LEGACY_COLLECTION, RKEY } from "@/lib/atproto/lexicon";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const agent = await getAgent(session.did);

    try {
      const response = await agent.com.atproto.repo.getRecord({
        repo: session.did,
        collection: COLLECTION,
        rkey: RKEY,
      });
      return NextResponse.json(response.data.value);
    } catch (primaryError: unknown) {
      const err = primaryError as { status?: number };
      if (err.status !== 400 && err.status !== 404) throw primaryError;

      // Fall back to the legacy NSID for users whose record predates the rebrand
      // and who have not yet triggered a dual-write. ADR-0003.
      try {
        const legacy = await agent.com.atproto.repo.getRecord({
          repo: session.did,
          collection: LEGACY_COLLECTION,
          rkey: RKEY,
        });
        return NextResponse.json(legacy.data.value);
      } catch (legacyError: unknown) {
        const lerr = legacyError as { status?: number };
        if (lerr.status === 400 || lerr.status === 404) {
          return NextResponse.json(null, { status: 404 });
        }
        throw legacyError;
      }
    }
  } catch (error: unknown) {
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

    if (record.age !== undefined && record.age < 18) {
      return NextResponse.json(
        { error: "Must be 18 or older" },
        { status: 400 }
      );
    }

    if (!record.createdAt) {
      record.createdAt = new Date().toISOString();
    }

    const agent = await getAgent(session.did);

    // Primary write — failure surfaces to the user. The $type stamp is set per write
    // so the record on the wire matches the collection it's stored under.
    await agent.com.atproto.repo.putRecord({
      repo: session.did,
      collection: COLLECTION,
      rkey: RKEY,
      record: { ...record, $type: COLLECTION },
    });

    // Legacy mirror write — best-effort during the dual-publish transition (ADR-0003).
    // A failure here is logged and swallowed; the user-facing request still succeeds
    // because the canonical record was written.
    try {
      await agent.com.atproto.repo.putRecord({
        repo: session.did,
        collection: LEGACY_COLLECTION,
        rkey: RKEY,
        record: { ...record, $type: LEGACY_COLLECTION },
      });
    } catch (legacyError) {
      console.warn(
        "Legacy mirror write to app.datesky.profile failed (ADR-0003 dual-publish):",
        legacyError
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Put profile error:", error);
    return NextResponse.json(
      { error: "Failed to save profile" },
      { status: 500 }
    );
  }
}
