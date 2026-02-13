"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProfileCard from "@/components/ProfileCard";
import type { IndexedProfile } from "@/lib/db/queries";

export default function BrowseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [profiles, setProfiles] = useState<IndexedProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [tag, setTag] = useState(searchParams.get("tag") || "");
  const [location, setLocation] = useState(
    searchParams.get("location") || ""
  );
  const [intention, setIntention] = useState(
    searchParams.get("intention") || ""
  );

  const fetchProfiles = useCallback(
    async (p: number) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (tag) params.set("tag", tag);
      if (location) params.set("location", location);
      if (intention) params.set("intention", intention);
      params.set("page", p.toString());

      try {
        const res = await fetch(`/api/browse?${params}`);
        const data = await res.json();
        setProfiles(data.profiles || []);
        setTotal(data.total || 0);
      } catch {
        setProfiles([]);
      } finally {
        setLoading(false);
      }
    },
    [tag, location, intention]
  );

  useEffect(() => {
    fetchProfiles(page);
  }, [page, fetchProfiles]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);

    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (location) params.set("location", location);
    if (intention) params.set("intention", intention);
    router.push(`/browse?${params}`);

    fetchProfiles(1);
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Browse Profiles</h1>

      {/* Filters */}
      <form
        onSubmit={handleSearch}
        className="grid sm:grid-cols-4 gap-3 mb-8"
      >
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag (e.g. hiking)"
          className="bg-sky-900/50 border border-sky-700 rounded-lg px-3 py-2 text-sm text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
        />
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          className="bg-sky-900/50 border border-sky-700 rounded-lg px-3 py-2 text-sm text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
        />
        <select
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          className="bg-sky-900/50 border border-sky-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-400"
        >
          <option value="">Any intention</option>
          <option value="dating">Dating</option>
          <option value="friends">Friends</option>
          <option value="casual">Casual</option>
          <option value="long-term">Long-term</option>
        </select>
        <button
          type="submit"
          className="bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
        >
          Search
        </button>
      </form>

      {/* Results */}
      {loading ? (
        <p className="text-sky-400 text-center py-12">Loading...</p>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sky-400 mb-2">No profiles found.</p>
          <p className="text-sky-600 text-sm">
            Be the first! Create your profile to get started.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sky-500 text-sm mb-4">
            {total} profile{total !== 1 ? "s" : ""} found
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <ProfileCard key={profile.did} profile={profile} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-sky-900/50 border border-sky-700 rounded-lg text-sm text-sky-300 disabled:opacity-50 hover:border-sky-500 transition-colors"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sky-400 text-sm">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-sky-900/50 border border-sky-700 rounded-lg text-sm text-sky-300 disabled:opacity-50 hover:border-sky-500 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
