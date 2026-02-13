import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import BrowseContent from "./BrowseContent";

export const runtime = "nodejs";

export default async function BrowsePage() {
  const session = await getSession();
  if (!session.did) {
    redirect("/");
  }

  return (
    <Suspense
      fallback={
        <main className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-6">Browse Profiles</h1>
          <p className="text-sky-400 text-center py-12">Loading...</p>
        </main>
      }
    >
      <BrowseContent />
    </Suspense>
  );
}
