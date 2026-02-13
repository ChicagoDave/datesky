import { Suspense } from "react";
import BrowseContent from "./BrowseContent";

export default function BrowsePage() {
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
