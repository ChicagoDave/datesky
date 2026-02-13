import { NextRequest, NextResponse } from "next/server";
import { browseProfiles } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tag = searchParams.get("tag") || undefined;
  const location = searchParams.get("location") || undefined;
  const intention = searchParams.get("intention") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
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
