import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  browseProfiles,
  getMatchCandidates,
  getProfileTags,
  getUserPreferences,
} from "@/lib/db/queries";
import { matchProfiles } from "@/lib/match";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);

  const matchParam = searchParams.get("match") === "1";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
    if (matchParam) {
      const prefs = getUserPreferences(session.did);
      if (!prefs.match_mode_enabled) {
        return NextResponse.json(
          { error: "Match mode is not enabled in your settings." },
          { status: 400 }
        );
      }
      const candidates = getMatchCandidates(session.did);
      const viewerTags = getProfileTags(session.did);
      const result = matchProfiles({
        viewerPrefs: prefs,
        viewerTags,
        candidates,
        page,
        limit,
      });
      return NextResponse.json(result);
    }

    const tag = searchParams.get("tag") || undefined;
    const location = searchParams.get("location") || undefined;
    const intention = searchParams.get("intention") || undefined;
    const result = browseProfiles({ tag, location, intention, page, limit });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Browse error:", error);
    return NextResponse.json(
      { error: "Failed to browse profiles" },
      { status: 500 }
    );
  }
}
