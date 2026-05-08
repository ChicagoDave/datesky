/**
 * POST /api/account/delete — irreversibly deletes the authenticated user's account.
 *
 * Public interface: `POST` only. Requires an authenticated session (401 otherwise).
 * On success, returns `{ ok: true }` and the iron-session cookie has been destroyed.
 *
 * Owner: Identity/Auth + Profile bounded contexts (the route is the entry point;
 * `deleteAccountForDid` is the orchestrator).
 *
 * Failure semantics: see ADR-0004. PDS errors abort before local-state mutation,
 * so the user may retry the request. The handler is idempotent — RecordNotFound
 * on either namespace is silenced inside the helper.
 *
 * Confirmation UX: the typed `DELETE` confirmation lives client-side per ADR-0005.
 * The handler does not validate a confirmation token — friction is a UI guard
 * against accidents, not an auth control.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAgent } from "@/lib/atproto/agent";
import { deleteAccountForDid } from "@/lib/atproto/account-deletion";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const did = session.did;

  try {
    const agent = await getAgent(did);
    await deleteAccountForDid(did, agent);
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json(
      { error: "Failed to delete account. Please try again." },
      { status: 500 }
    );
  }

  // Destroy the iron-session cookie last — only after the DB row is gone, so
  // the client has no way to reach a half-deleted state via a session resume.
  session.destroy();

  return NextResponse.json({ ok: true });
}
