import type { DateSkyProfile } from "@/lib/atproto/lexicon";
import Link from "next/link";

interface ProfileViewProps {
  profile: DateSkyProfile;
  did: string;
  handle?: string;
  pdsHost?: string;
}

export default function ProfileView({
  profile,
  did,
  handle,
  pdsHost,
}: ProfileViewProps) {
  const displayHandle = handle || did;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Primary photo */}
        {profile.photos && profile.photos.length > 0 && pdsHost && (
          <div className="w-32 h-32 rounded-xl overflow-hidden bg-sky-900/50 flex-shrink-0">
            <img
              src={`https://${pdsHost}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(profile.photos[0].image.ref.$link)}`}
              alt={profile.photos[0].alt || "Profile photo"}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="space-y-1">
          {profile.displayName && (
            <h1 className="text-3xl font-bold">{profile.displayName}</h1>
          )}
          <p className="text-sky-400 text-sm">@{displayHandle}</p>
          <div className="flex flex-wrap gap-3 text-sm text-sky-300">
            {profile.age && <span>{profile.age} years old</span>}
            {profile.pronouns && <span>{profile.pronouns}</span>}
            {profile.gender && <span>{profile.gender}</span>}
            {profile.location && <span>{profile.location}</span>}
          </div>
        </div>
      </div>

      {/* Intentions */}
      {profile.intentions && profile.intentions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {profile.intentions.map((intention) => (
            <span
              key={intention}
              className="bg-sky-500/20 text-sky-300 text-sm px-3 py-1 rounded-full border border-sky-500/30"
            >
              {intention}
            </span>
          ))}
        </div>
      )}

      {/* Bio */}
      {profile.bio && (
        <div className="bg-sky-900/30 rounded-lg p-4">
          <p className="text-sky-100 whitespace-pre-wrap">{profile.bio}</p>
        </div>
      )}

      {/* Photo gallery */}
      {profile.photos && profile.photos.length > 1 && pdsHost && (
        <div className="grid grid-cols-3 gap-2">
          {profile.photos.slice(1).map((photo, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg overflow-hidden bg-sky-900/50"
            >
              <img
                src={`https://${pdsHost}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(photo.image.ref.$link)}`}
                alt={photo.alt || `Photo ${i + 2}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      {profile.tags && profile.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {profile.tags.map((tag) => (
            <Link
              key={tag}
              href={`/browse?tag=${encodeURIComponent(tag)}`}
              className="bg-sky-800 text-sky-200 text-sm px-3 py-1 rounded-full hover:bg-sky-700 transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-sky-800/50">
        <a
          href={`https://bsky.app/profile/${displayHandle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          Message on Bluesky
        </a>
        <Link
          href="/browse"
          className="bg-sky-900/50 hover:bg-sky-800 text-sky-300 px-6 py-2 rounded-lg border border-sky-700 transition-colors"
        >
          Back to browse
        </Link>
      </div>
    </div>
  );
}
