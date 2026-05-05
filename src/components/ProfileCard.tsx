/**
 * Browse-list card for an indexed profile.
 *
 * Public interface: <ProfileCard profile compact /> — renders either the rich card
 *   layout (default) or the compact text-row layout when compact is true.
 * Owner context: browse list rendering.
 *
 * Compact mode shows only handle, age, location, and tags — no display name, bio,
 * or intentions, and never any photo. See ADR 0001 §"Compact view" and the
 * settings page for user-facing behavior.
 */
import Link from "next/link";
import type { IndexedProfile } from "@/lib/db/queries";

interface ProfileCardProps {
  profile: IndexedProfile;
  compact?: boolean;
}

export default function ProfileCard({ profile, compact }: ProfileCardProps) {
  if (compact) {
    return <CompactRow profile={profile} />;
  }
  return <RichCard profile={profile} />;
}

function CompactRow({ profile }: { profile: IndexedProfile }) {
  const handleText =
    profile.handle ?? profile.display_name ?? profile.did.slice(0, 16);
  const tagsPreview = (profile.tags ?? []).slice(0, 5);

  return (
    <Link
      href={`/profile/${encodeURIComponent(profile.did)}`}
      className="flex items-baseline gap-3 px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.06] transition-colors text-sm"
    >
      <span className="text-white font-medium truncate">@{handleText}</span>
      {profile.age != null && (
        <span className="text-sky-400 flex-shrink-0">{profile.age}</span>
      )}
      {profile.location && (
        <span className="text-sky-400 flex-shrink-0 truncate">
          · {profile.location}
        </span>
      )}
      {tagsPreview.length > 0 && (
        <span className="text-sky-500 truncate">
          ·{" "}
          {tagsPreview.map((t) => `#${t}`).join(" ")}
          {(profile.tags?.length ?? 0) > 5 && (
            <span className="text-sky-600">
              {" "}
              +{(profile.tags?.length ?? 0) - 5}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

function RichCard({ profile }: { profile: IndexedProfile }) {
  return (
    <Link
      href={`/profile/${encodeURIComponent(profile.did)}`}
      className="block bg-sky-900/30 rounded-lg border border-sky-800/50 p-4 hover:border-sky-600 transition-colors"
    >
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold text-white truncate">
            {profile.display_name || profile.handle || profile.did.slice(0, 20)}
          </h3>
          {profile.age && (
            <span className="text-sky-400 text-sm ml-2">{profile.age}</span>
          )}
        </div>

        {profile.handle && (
          <p className="text-sky-500 text-xs">@{profile.handle}</p>
        )}

        {profile.location && (
          <p className="text-sky-400 text-sm">{profile.location}</p>
        )}

        {profile.bio && (
          <p className="text-sky-300 text-sm line-clamp-2">{profile.bio}</p>
        )}

        {profile.intentions && profile.intentions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.intentions.map((intention) => (
              <span
                key={intention}
                className="bg-sky-500/20 text-sky-300 text-xs px-2 py-0.5 rounded-full"
              >
                {intention}
              </span>
            ))}
          </div>
        )}

        {profile.tags && profile.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="bg-sky-800/50 text-sky-400 text-xs px-2 py-0.5 rounded-full"
              >
                #{tag}
              </span>
            ))}
            {profile.tags.length > 5 && (
              <span className="text-sky-600 text-xs">
                +{profile.tags.length - 5}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
