import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/atproto/agent";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 1_000_000; // 1MB

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.did) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File must be PNG, JPEG, or WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File must be under 1MB" },
        { status: 400 }
      );
    }

    const agent = await getAgent(session.did);
    const buffer = new Uint8Array(await file.arrayBuffer());
    const response = await agent.com.atproto.repo.uploadBlob(buffer, {
      encoding: file.type,
    });

    return NextResponse.json({
      blob: response.data.blob,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
