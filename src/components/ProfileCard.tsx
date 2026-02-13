import Link from "next/link";
import type { IndexedProfile } from "@/lib/db/queries";

interface ProfileCardProps {
  profile: IndexedProfile;
}

export default function ProfileCard({ profile }: ProfileCardProps) {
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
