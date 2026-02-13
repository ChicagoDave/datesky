import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();

  if (session.did) {
    return NextResponse.json({
      authenticated: true,
      did: session.did,
      handle: session.handle,
    });
  }

  return NextResponse.json({ authenticated: false });
}
