"use client";

/**
 * Browse list — handles both the open browse path and match-mode.
 *
 * Public interface: <BrowseContent compactView matchModeEnabled />.
 * Owner context: browse view.
 *
 * In open browse: viewer enters tag/location/intention filters and the API
 *   returns matching profiles by indexed_at.
 * In match mode (matchModeEnabled = true): the API ignores the filter inputs
 *   and uses the viewer's stored preferences. The response includes a per-axis
 *   "close" breakdown which is rendered below the list.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import ProfileCard from "@/components/ProfileCard";
import type { IndexedProfile } from "@/lib/db/queries";
import type { MatchClose } from "@/lib/match";

interface BrowseContentProps {
  compactView: boolean;
  matchModeEnabled: boolean;
}

interface BrowseResponse {
  profiles: IndexedProfile[];
  total: number;
  close?: MatchClose;
  viewerTagsInsufficient?: boolean;
  error?: string;
}

export default function BrowseContent({
  compactView,
  matchModeEnabled,
}: BrowseContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [profiles, setProfiles] = useState<IndexedProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [close, setClose] = useState<MatchClose | null>(null);
  const [viewerTagsInsufficient, setViewerTagsInsufficient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tag, setTag] = useState(searchParams.get("tag") || "");
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [intention, setIntention] = useState(
    searchParams.get("intention") || ""
  );

  const fetchProfiles = useCallback(
    async (p: number) => {
      setLoading(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      params.set("page", p.toString());
      if (matchModeEnabled) {
        params.set("match", "1");
      } else {
        if (tag) params.set("tag", tag);
        if (location) params.set("location", location);
        if (intention) params.set("intention", intention);
      }
      try {
        const res = await fetch(`/api/browse?${params}`);
        const data = (await res.json()) as BrowseResponse;
        if (!res.ok) {
          setErrorMsg(data.error || "Could not load profiles.");
          setProfiles([]);
          setTotal(0);
        } else {
          setProfiles(data.profiles || []);
          setTotal(data.total || 0);
          setClose(data.close ?? null);
          setViewerTagsInsufficient(!!data.viewerTagsInsufficient);
        }
      } catch {
        setProfiles([]);
        setErrorMsg("Network error.");
      } finally {
        setLoading(false);
      }
    },
    [tag, location, intention, matchModeEnabled]
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
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {matchModeEnabled ? "Match mode" : "Browse profiles"}
        </h1>
        {matchModeEnabled && (
          <Link
            href="/settings"
            className="text-sm text-sky-400 hover:text-white underline transition-colors"
          >
            Adjust preferences
          </Link>
        )}
      </div>

      {matchModeEnabled ? (
        <div className="mb-6 px-4 py-3 rounded-lg bg-gradient-to-r from-[#d60270]/10 to-[#9b4f96]/10 border border-[#9b4f96]/30 text-sm text-sky-200">
          Showing only profiles that fit your preferences. Toggle off in{" "}
          <Link href="/settings" className="underline hover:text-white">
            settings
          </Link>{" "}
          to see everyone.
        </div>
      ) : (
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
      )}

      {viewerTagsInsufficient && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
          Match mode works best when you&apos;ve added at least 2 tags to your
          own profile. Without them, candidates can&apos;t be ranked by shared
          interests.{" "}
          <Link href="/profile/edit" className="underline hover:text-white">
            Edit your profile
          </Link>
          .
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-200">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sky-400 text-center py-12">Loading...</p>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sky-400 mb-2">
            {matchModeEnabled
              ? "No profiles match your preferences."
              : "No profiles found."}
          </p>
          <p className="text-sky-600 text-sm">
            {matchModeEnabled
              ? "Widen your filters in settings to see more."
              : "Be the first! Create your profile to get started."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sky-500 text-sm mb-4">
            {matchModeEnabled
              ? `${total} match${total !== 1 ? "es" : ""}`
              : `${total} profile${total !== 1 ? "s" : ""} found`}
          </p>
          <div
            className={
              compactView
                ? "divide-y divide-white/5 border border-white/10 rounded-lg overflow-hidden"
                : "grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            }
          >
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.did}
                profile={profile}
                compact={compactView}
              />
            ))}
          </div>

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

      {matchModeEnabled && close && hasAnyClose(close) && (
        <CloseBreakdown close={close} />
      )}
    </main>
  );
}

function hasAnyClose(c: MatchClose): boolean {
  return c.intent + c.gender + c.age + c.location > 0;
}

function CloseBreakdown({ close }: { close: MatchClose }) {
  const items: Array<{ label: string; count: number }> = [];
  if (close.age > 0) items.push({ label: "outside age range", count: close.age });
  if (close.location > 0)
    items.push({ label: "different location", count: close.location });
  if (close.gender > 0)
    items.push({ label: "different gender preference", count: close.gender });
  if (close.intent > 0)
    items.push({ label: "different intent", count: close.intent });

  return (
    <div className="mt-10 pt-6 border-t border-white/10">
      <p className="text-xs uppercase tracking-wide text-sky-400 mb-2">
        Close to your filters
      </p>
      <p className="text-sm text-sky-300">
        {items.map((item, i) => (
          <span key={item.label}>
            {i > 0 && <span className="text-sky-600"> · </span>}
            <span className="text-white font-medium">{item.count}</span>{" "}
            {item.label}
          </span>
        ))}
      </p>
      <p className="text-xs text-sky-500 mt-1">
        Adjust the matching filter in{" "}
        <Link href="/settings" className="underline hover:text-white">
          settings
        </Link>{" "}
        to see them.
      </p>
    </div>
  );
}
