/**
 * Server-side session helper for Nomare.
 *
 * Public interface: `getSession()` returns the typed iron-session bound to
 * the request's cookie store. `SessionData` is the persisted shape.
 *
 * Owner: Identity/Auth bounded context.
 *
 * Cookie name is intentionally distinct from the prior `datesky_session` name
 * — the rename forces a re-login on every browser carrying the old cookie,
 * coordinated with the OAuth client_id cutover (Phase 3 of the Nomare
 * rebrand, ADR-0002 / plan.md).
 */
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  did?: string;
  handle?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "nomare_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

/** Returns the iron-session for the current request, typed as `SessionData`. */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
